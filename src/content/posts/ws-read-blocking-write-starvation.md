---
title: '一次被 ws.read() 卡死的发送:同步 WebSocket 客户端的"读阻塞 vs 写饥饿"之殇'
date: 2026-08-05
lastMod: 2026-08-05T12:00:00.000Z
tags: [Rust, WebSocket, Tungstenite]
category: 技术
summary: 单线程事件循环下，同步 WebSocket 的 read() 无限阻塞会饿死发送通道——AI 对话 join 全部成功却 20 秒超时的根因。修复：set_read_timeout + WouldBlock，让读线程周期性苏醒回去处理待发消息。
---

> 背景:把 Python 的云变量操作与 AI 对话功能移植到 Rust,约束是"仅使用 `tungstenite + rustls`、无 async runtime、库形式"。真机联调时,AI 对话的 `join` 全部成功,但发送聊天消息后 20 秒超时——服务器一个字节都没回。最后发现,问题根本不在协议,而在**读线程自己把自己堵死了**。

---

## 一、问题的表象

真机帧流(修复前):

```
[收] 42["join_ack",{"code":1,...}]          ← join 成功
[发] 42 ["preset_chat_message",{...}]       ← 预设消息正常
[发] 42 ["get_text2Img_remaining_times"]    ← 正常
[发] 42 ["chat",{"chat_type":"chat_v3",...}] ← 消息发出(入队)
(此后 20 秒内服务器零帧)
[超时] AI 未开始回复
```

诡异之处:握手阶段(`0` → `40` → `join_ack` → 各种 ack)一切正常,唯独 `chat` 帧石沉大海。而**同样的帧、同样的时序**,在服务器消息密集的窗口内一切顺利——这提示问题与"时机"有关,而不是帧格式。

## 二、架构:为什么选了"单线程事件循环 + channel"

约束只有 `tungstenite`(同步)和 `rustls`,没有 tokio。而 `tungstenite::connect` 返回的 `WebSocket<S>` 是一个**独占型**对象:

```rust
impl<S> WebSocket<S> {
    pub fn send(&mut self, msg: Message) -> Result<()>;
    pub fn read(&mut self) -> Result<Message>;   // ← 阻塞
}
```

读写都需要 `&mut self`,意味着**同一个 WebSocket 同时只能被一个线程持有**。为了让外部任意线程都能随时发消息,自然的选择是:

```
┌─────────────┐   mpsc channel   ┌─────────────────────┐
│ 任意调用线程 │ ───────────────▶ │        读线程        │
│  send_event  │                  │  rx.recv_timeout()  │ ① 取待发消息
└─────────────┘                  │  ws.send(msg)        │ ② 发出
                                 │  ws.read()           │ ③ 读入站 ← 阻塞点
                                 └─────────────────────┘
```

读线程的循环(真实代码,`src/core/cloud.rs`):

```rust
fn read_loop(inner: Arc<CloudInner>, mut ws: Ws, rx: mpsc::Receiver<Message>) {
    'outer: loop {
        if inner.stopping.load(Ordering::Acquire) {
            break;
        }
        // ① 先处理积压的待发消息(最多等 100ms,连续 16 条封顶)
        let mut sent = 0;
        loop {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(msg) => {
                    if let Err(e) = ws.send(msg) {
                        info!("发送失败: {e}");
                        break 'outer;
                    }
                    sent += 1;
                    if sent >= 16 {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => break 'outer,
            }
        }
        // ② 读取入站消息 —— 这里会无限阻塞
        match ws.read() {
            // ...
            Err(e) => {
                info!("云存储读取结束: {e}");
                break;
            }
        }
    }
    drop(rx);
    on_connection_lost(inner);
}
```

设计意图:每次循环**先处理发送、再读一条入站消息**。只要服务器帧流不断,循环就不断,发送永远及时。

## 三、根因:`ws.read()` 是无限阻塞的

tungstenite 0.26 的同步 API 有三个"硬限制",叠加在一起构成事故:

| 限制 | 后果 |
|---|---|
| ① `read()` 无限阻塞,无超时参数 | 服务器不发帧,线程就停在 `read()` 里出不来 |
| ② 没有 `try_read()` / 非阻塞读 | 想"先看一眼有没有数据"都不行 |
| ③ 不能 `split()` 成读写两个半部 | 无法用"发送线程 + 接收线程"绕开 |

所以循环顶部的 `recv_timeout` **只有在 `read()` 返回之后才会被执行**。而 `read()` 何时返回?**取决于服务器何时发帧**。

于是时序变成:

```
t=0   服务器静默(握手帧已发完,下一帧是 25s 后的 ping)
t=0.1 调用线程把 chat 帧投入 channel
t=0.1 读线程正阻塞在 ws.read()  ← chat 帧躺在 channel 里
t=20  等待超时,测试失败
t=25  服务器发 ping,read() 终于返回,chat 帧这才发出去(为时已晚)
```

**chat 帧被"饿死"在 channel 里**——发送路径本身没有坏,坏在读线程被 `read()` 独占,永远没机会回到发送逻辑。握手阶段之所以正常,是因为那几秒服务器帧非常密集(`on_connect_ack`、`40`、`join_ack`、ack 连珠炮),读线程高频往返,发送总能被及时处理。

> 类比:一条单车道隧道,入口的闸机(发送)只在有车从对面开过来(入站帧)时才抬杆。对向车流一停,你要发的车就永远堵在入口。

## 四、为什么不能简单"包个 Mutex"或"加个发送线程"?

直觉上的两个方案都有致命问题:

**方案 A:两个线程共享 `Mutex<WebSocket>`**

```rust
// 发送线程
let mut ws = ws_mutex.lock().unwrap();
ws.send(msg);          // ← 读线程正持锁 read(),这里会等锁
```

读线程持有 `&mut WebSocket` 阻塞在 `read()` 上,发送线程拿不到锁——**饥饿问题原封不动,只是换了个名字**。`Mutex` 解决的是"并发访问",解决不了"持锁阻塞"。

**方案 B:发送线程直接 `ws.send()`(无锁)**

`WebSocket` 不实现 `Sync`,编译都过不了——独占引用的语义在类型层面就禁止了双线程。

**方案 C:开启 `permessage-deflate`/依赖服务器 ping**

服务器 25s 才一个 ping,而业务超时通常远小于 25s,不可控。

所以在"只有同步 API、不能拆读写"的约束下,唯一干净的出路是:**让 `read()` 自己会超时**。

## 五、修复:给底层流设 `set_read_timeout`

tungstenite 虽然不暴露读超时,但给了 `ws.get_mut()` 泄漏底层流。`MaybeTlsStream<TcpStream>` 有两种形态:

```rust
pub enum MaybeTlsStream<S: Read + Write> {
    Plain(S),                                  // 裸 TCP
    Rustls(rustls::StreamOwned<rustls::ClientConnection, S>),  // TLS
}
```

而 `rustls::StreamOwned` 的两个字段(`sock`、`conn`)都是 **pub**——可以直接拿到里面的 `TcpStream`:

```rust
/// 设置 WebSocket 底层流的读取超时(Plain 或 rustls 两种形态)。
fn set_stream_read_timeout(stream: &mut WsStream, timeout: Duration) -> std::io::Result<()> {
    match stream {
        MaybeTlsStream::Plain(s) => s.set_read_timeout(Some(timeout)),
        MaybeTlsStream::Rustls(owned) => owned.sock.set_read_timeout(Some(timeout)),
        _ => Ok(()),
    }
}
```

在 `establish()` 中,连接建立后立即设置:

```rust
let (mut ws, response) = connect(request)?;
// WebSocket 升级成功返回 HTTP 101 Switching Protocols
if response.status() != http::StatusCode::SWITCHING_PROTOCOLS {
    return Err(CloudError::Handshake(format!("HTTP 状态: {}", response.status())));
}
// 设置底层流读取超时:read 周期性苏醒,避免服务器静默时发送通道饥饿
let _ = set_stream_read_timeout(ws.get_mut(), Duration::from_millis(200));
```

`set_read_timeout` 底层是 `SO_RCVTIMEO`:内核保证 `recv` 最多阻塞 200ms,超时返回 `EAGAIN`(即 Rust 的 `WouldBlock`)。

读循环中,把 `WouldBlock` 从"致命错误"改判为"该回去处理发送了":

```rust
match ws.read() {
    // ... 正常帧分支略 ...
    // 读取超时:回到循环顶部处理待发送消息
    Err(tungstenite::Error::Io(ref e)) if e.kind() == std::io::ErrorKind::WouldBlock => {
        continue;
    }
    Err(e) => {
        info!("云存储读取结束: {e}");
        break;
    }
}
```

修复后的循环变成:

```
① rx.recv_timeout(100ms) 处理待发消息
② ws.read()              最多阻塞 200ms
   ├─ 有帧 → 处理,回 ①
   └─ WouldBlock → 回 ①   ← 新路径:哪怕服务器静默,每 200ms 回来一次
```

于是 chat 帧最多在 channel 里躺 200ms(① 的等待)+ 200ms(read 超时),即**最坏 ~300ms 内必然发出**,远小于 20s 超时。

## 六、为什么这样改是安全的(不丢数据)

一个自然的担忧:`read()` 超时会不会把"读到一半的帧"丢掉?**不会**,原因有三层:

1. **tungstenite 自己先缓冲**:`WebSocket::read()` 先把原始字节读进内部的 `ReadBuffer`,再解析成 `Message`。`WouldBlock` 发生时,半包字节**已经安全地留在缓冲区里**,下次 `read()` 从缓冲区继续,不丢不重。
2. **rustls 同样有内部缓冲**:`rustls::StreamOwned::read` 触底返回 `EAGAIN` 时,TLS 记录层已解密的剩余数据保留在 `conn` 内部,下次续读。
3. **`WouldBlock` 只是"暂时没数据",不是错误**:语义与 `WouldBlock` 处理 socket 编程中的 `EAGAIN` 完全一致——`continue` 重试即可。

## 七、修复效果(真机验证)

```
[云变量] 私有 4 公有 9 列表 1, 在线 1          ← 只读流程正常
[AI回复] > 思考如何满足用户需求……              ← chat 帧成功发出并收到流式回复
test result: ok. 2 passed; 0 failed           ← 两个模块真机测试全过
```

修复前 AI 对话必超时,修复后 300ms 内发出、完整收到流式回复。同样的修复同时消除了云变量批量上传在服务器静默期的潜在延迟(云变量的写操作也走同一条 channel)。

## 八、教训与备选方案

**通用教训**:任何"单线程事件循环"式的同步网络代码,读操作**必须有超时**——否则读与写无法共存,写方必然被读方饿死。这不是 tungstenite 的 bug,而是它的 API 约束(同步、独占、无 `split`);调用方必须在约束内绕行,`set_read_timeout + WouldBlock` 就是那条绕行路线。

**如果约束放宽,更好的选择**:

| 方案 | 说明 |
|---|---|
| `tokio-tungstenite` | 异步 + `split()` 读写分离,两个 `task` 各干各的,天然无饥饿 |
| 独立发送线程 + 队列 | 需要 `WebSocket` 可拆写半部(异步实现才有) |
| 缩短服务器 ping 间隔 | 不可控(服务器说了算),治标不治本 |

但在"仅 tungstenite + rustls、无 async runtime"的约束下,给底层流设读超时是**唯一干净且正确**的解法——它不引入新依赖、不改变架构、不丢数据,只让读线程有了"回头看一眼发送队列"的机会。
