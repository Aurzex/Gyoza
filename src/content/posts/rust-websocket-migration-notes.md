---
title: Rust 重写 Python WebSocket 服务踩坑全记录(详细版)
date: 2026-08-05
lastMod: 2026-08-05T12:00:00.000Z
tags: [Rust, WebSocket, Tungstenite, Rustls]
category: 技术
summary: 将 Python 的云变量操作与 AI 助手对话移植到 Rust（仅 tungstenite + rustls、无 async runtime、库形式）的 25 个踩坑实录，按业务协议、并发线程、编译类型、调试方法论四层组织。
---

> **项目背景**:将 Python 的「操作云变量」(`cloudcfg.py`)与「AI 助手对话」(`deepser.py`)移植到 Rust。硬约束:**仅使用 `tungstenite + rustls`、无 async runtime、以库形式提供、建造者模式 + 链式调用、用 `log` 替代 `print`**。真机联调贯穿全程,先后用两个账号验证(第一个账号 AI 对话配额为 0,第二个账号正常)。
>
> 全文按「业务协议 → 并发线程 → 编译类型 → 调试方法论」四层组织。前两层是"为什么连不通/连上了不工作",第三层是"为什么编译不过",第四层是"怎么快速定位"。每条坑均含:现象、根因、修复代码、验证结果、通用教训。

---

# 第一部分:业务/协议层(最容易翻车,且错误信息极具误导性)

## 坑 1:401 的真凶是 URL 参数,不是 TLS 指纹

**严重度:★★★★★。这是耗时最久、误导性最强、也最值得记住的一个坑。**

### 现象

Rust 端连接云存储 WebSocket:

```
wss://socketcv.codemao.cn:9096/cloudstorage/?session_id=194684070&authorization_type=5&stag=3&EIO=3&transport=websocket
```

服务器在 HTTP 升级阶段直接拒绝:

```text
Status: 401 Unauthorized
```

而同一账号、同一作品,Python 端连接完全正常。

### 一段注定失败的排查史(来自一次失败预研)

这个 401 曾被认为是"TLS 指纹问题",排查过程如下:

1. **对比 HTTP 请求头**:把 Rust 的 header 与 Python 的 `enableTrace` 输出逐行对比,移除多余字段,仍 401;
2. **对比 device-auth 签名**:`SHA256(secret + timestamp + client_id)` 的 Rust 与 Python 结果逐字节一致,仍 401;
3. **换 TLS 后端**:`native-tls`(Windows SChannel)仍 401;手动强制 TLS 1.3 + 定制密码套件,仍 401;
4. **抓包对比 Client Hello**:发现 rustls 0.23 强制发送 `status_request`(OCSP)扩展,而 Python 的系统 ssl(SChannel)不发送,JA3 指纹不同;
5. **归因**:断定服务器做了"JA3 白名单,拒绝带 `status_request` 扩展的客户端";
6. **试图禁用 OCSP**:`rustls::ClientConfig` 0.23 根本没有 `ocsp_stapling` 字段,官方文档声称"客户端默认不发送",实测却发了——文档与行为矛盾;
7. **绝望方案**:降级 rustls 0.22、改用 boring-tls、用 rquest 伪造 JA3、fork rustls 注释源码、甚至 Python 桥接。

### 真正的根因

URL 里的两个 query 参数——**`authorization_type` 与 `stag` 必须与作品编辑器类型匹配**:

| 编辑器类型    | authorization_type | stag |
| ------------- | ------------------ | ---- |
| Kitten / Coco | 1                  | 1    |
| Nemo          | 5                  | 2    |
| KittenN       | 5                  | 3    |

用 `KittenN(5,3)` 去连一个 `ide_type: "KITTEN"` 的作品 → 401;改成 `Kitten(1,1)` → 立即 `101 Switching Protocols`。正确做法是连接前先查作品信息并自动推断:

```rust
// 通过 work API 获取作品类型
let info = WorkDataFetcher::new().fetch_work_details(work_id)?;
// info["ide_type"] == "KITTEN" → EditorType::Kitten
```

### 为什么这条排查路线必然失败?(逻辑推理即可证伪)

- **401 是 HTTP 层响应**。服务器要返回 `401 Unauthorized`,必须先完成 TLS 握手、读完整个 HTTP 升级请求、解析出业务凭证,然后才拒绝。
- 如果服务器真的"在 TLS 层按 JA3 指纹拒绝",你**根本到不了 HTTP 层**——要么握手失败(`handshake failure`),要么 TCP 被断,绝不会收到带 HTTP 状态码的响应。
- 服务器收下了你的 Client Hello(不管扩展列表是什么)、收下了你的 HTTP 请求,然后说"业务凭证不对" → **这是业务层拒绝**(URL 参数 / device-auth / token),与指纹无关。

> 为什么今天能成功而当年不能?今天遇到 401 后,第一件事是**用 work API 查作品类型** → 发现是 KITTEN 作品 → 修正 editor 参数 → 成功。当年在"TLS 方向"深挖了四层,唯独没有打印并对比**完整请求 URL 的 query 部分**——那是唯一真正不同的变量。

### 通用教训

1. 网络错误先做**二分定位**:对比"Python 成功 vs Rust 失败"的完整请求(URL 全部参数、headers、签名、token)四个变量,最后才怀疑 TLS;
2. **用协议分层校准归因**:能收到 HTTP 响应 ⇒ TLS 已成功 ⇒ 问题在业务层;
3. 抓包很有用,但抓包结果要回答"哪一层能产生这个响应"。

---

## 坑 2:WebSocket 升级成功返回 HTTP 101,不是 200

**严重度:★★(低级但必踩)。**

### 现象

`tungstenite::connect(request)` 明明成功了,代码却报错退出:

```text
Handshake("HTTP 状态: 101 Switching Protocols")
```

### 根因

`http::StatusCode::is_success()` 只认 2xx,而 WebSocket 升级成功是 **101 Switching Protocols**(1xx 信息类)。常见错误是写成:

```rust
if !response.status().is_success() { return Err(...); }   // 101 被判失败
```

### 修复

```rust
let (mut ws, response) = connect(request)?;
if response.status() != http::StatusCode::SWITCHING_PROTOCOLS {
    return Err(CloudError::Handshake(format!("HTTP 状态: {}", response.status())));
}
```

### 教训

WebSocket 客户端代码里,"升级成功"的判断条件永远是 `== 101`,而不是"2xx"。这个坑在 `cloud.rs` 和 `chat.rs` 各踩一次(两处代码结构相同)。

---

## 坑 3:`list_variables_done` 的载荷是 JSON 字符串,不是数组

**严重度:★★★★。数据"读到了"却一条都解析不出来,最迷惑的一类。**

### 现象

云存储连接、`join`、请求数据全部成功,`data_ready = true`,但变量/列表计数全是 0:

```text
[LOG] WARN - list_variables_done 载荷不是数组: "[{\"cvid\":\"N3qYybmo\",\"name\":\"聊\",\"value\":[...],\"type\":2},{\"cvid\":\"A2997Hxk\",\"name\":\"金币\",\"value\":0,\"type\":0}, ...]"
[数据] 私有 0 公有 0 列表 0
```

注意日志:载荷**以 `"` 开头**——它是**字符串**,不是数组。

### 根因

事件帧 `42["list_variables_done","[{...}]"]` 的第二个元素是 **JSON 编码后的字符串**,需要**二次解析**才能得到真正的数组。Python 的 `_handle_event_message` 有这一步:

```python
if isinstance(message_data, str):
    try:
        message_data = loads(message_data)   # 字符串载荷二次解析
    except JSONDecodeError:
        pass
```

移植时漏掉了这个细节。

### 修复(放在帧解析层统一处理)

```rust
let mut payload = items.get(1).cloned().unwrap_or(Value::Null);
// 部分事件(如 list_variables_done)载荷是 JSON 字符串,需二次解析
// (与 Python _handle_event_message 行为一致;解析失败则保持原字符串)
if let Value::String(s) = &payload
    && let Ok(parsed) = serde_json::from_str::<Value>(s)
{
    payload = parsed;
}
return Frame::Event(name.clone(), payload);
```

一个巧妙之处:解析失败时保持原字符串,恰好符合 `update_vars_done` 的 `"fail"` 载荷语义——`"fail"` 不是合法 JSON,保持字符串,处理器里 `payload.as_str() == Some("fail")` 直接短路返回。

### 验证

修复后:

```text
[数据] 私有 4 公有 9 列表 1
```

同时新增单元测试覆盖"字符串载荷二次解析"与"`fail` 保持原样"两条路径。

### 教训

**协议里"值可以是 JSON 字符串,字符串里又是 JSON"这种嵌套,是移植时最容易漏的隐式约定。** 排查"数据全空"时,先打印原始载荷的**第一字节**——是 `[` 还是 `"`,立刻见分晓。

---

## 坑 4:服务器重复回 `40`,无防重导致重复 JOIN 被服务器断开

**严重度:★★★。属于"连接总是莫名被断"类问题。**

### 现象

云存储连接后,日志里"发送 JOIN"出现**两次**,随后:

```text
[LOG] INFO - 收到服务器关闭请求 (41)
[LOG] INFO - 连接断开,第 1 次重连将于 8s 后进行
```

### 根因

服务器对客户端的 `40`(Socket.IO 连接确认)会**重复回 `40`**(可能回两次)。我们的 `handle_frame` 每收到一次 `40` 就发一次 JOIN,第二次 JOIN 被服务器视为非法 → 发 `41` 断开。Python 端有 `_join_sent` 标志防重,移植时漏了。

### 修复

```rust
// CloudInner 增加 join_sent: AtomicBool
Frame::Connected => {
    inner.notify.notify_with(|| {
        inner.connected.store(true, Ordering::Release);
        inner.io_ready.store(true, Ordering::Release);
        inner.reconnect_attempts.store(0, Ordering::Release);
    });
    emit_connection_event(inner, ConnectionEvent::Opened);
    // 服务器可能重复回 40,只发送一次 JOIN
    if inner.join_sent.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    info!("云存储连接确认,发送 JOIN 消息");
    send_inner_event(inner, "join", &json!(inner.work_id.to_string()))
}
```

同时注意:重连后要重置 `join_sent = false`(新会话需要重新 JOIN),`reset_state()` / `establish()` / `on_connection_lost()` 三处都要处理——**防重标志的生命周期管理是这类坑的隐藏部分**。

---

## 坑 5:CodeMao 服务器对帧格式有"字面量级"的要求

**严重度:★★★★★。这是 AI 对话端"join 一直失败"的元凶。**

### 现象

AI 对话连接后,`join_ack` 反复返回:

```json
{ "code": 10000000, "code_msg": "服务器响应异常，请稍后重试", "data": {} }
```

并且伴随一条奇怪的 `chat_ack`:

```json
{
  "code": 10000000,
  "data": { "content_type": "stream_output_end", "content": "非法操作", "session_id": "" }
}
```

### 排查过程

- 先怀疑时序,把 join 从"收到 `40` 立即发"改成"收到 `on_connect_ack` 再发"——仍然失败;
- 最后把**发送的帧逐字节与 `deepser.py` 对比**,发现差异在字面量:

```python
# Python 发送(deepser.py)
ws.send('42 ["join"]')                              # ← 42 后有一个空格,join 无 payload
ws.send(f'42 ["chat",{dumps(chat_data)}]')          # ← 带空格
```

```rust
// 我最初发送(紧凑格式)
42["join",null]                                     // ← 无空格,且带 null payload
```

服务器对 `42["join",null]` 判"非法操作",对 `42 ["join"]` 正常接受。

### 修复

所有出站事件帧统一为 `42 ["name",payload]`(带空格);JOIN 特判为无 payload 的裸字符串:

```rust
// join:与 Python 的 `'42 ["join"]'` 逐字一致
send_raw(inner, "42 [\"join\"]")

// 其它事件帧
fn send_event_on(inner: &Arc<ChatInner>, name: &str, payload: &Value) -> Result<()> {
    let frame = format!(
        "{EVENT_MESSAGE_PREFIX} {}",   // "42" + 空格
        serde_json::to_string(&(name, payload))?
    );
    // ...
}
```

### 验证

修复后 `join_ack` 返回 `code: 1`,并带出 `user_id` 与 `search_session`。

### 教训

**协议移植,先复刻"字面量"再谈优化。** 空格、payload 有无、字段顺序这些在文档里不存在的细节,服务器可能严格校验。排查这类问题的手段只有一个:**打印自己发送的每一帧,与 Python 原版发送的字符串逐字节 diff**。

---

## 坑 6:join 有时序要求——等服务器就绪再发

**严重度:★★★。时序敏感类问题的代表。**

### 现象

把帧格式修对后,join 依然**不稳定**:有时成功有时 `10000000`。

### 根因

AI 服务的会话初始化流程:

```
客户端发 40 ──▶ 服务器回 40
             ──▶ 服务器回 on_connect_ack(会话就绪信号)
客户端发 join ◀── 应该在这之后
```

收到 `40` 立即发 join,可能撞上服务器尚未完成会话初始化;收到 `on_connect_ack` 再发则稳定成功。Python 端在 `on_open` 后 `sleep(1)` 再发 join,本质是等同样的就绪信号,只是用时间换。

### 修复(chat.rs)

`Frame::Connected` 只置连接标志,不再发 join;把 JOIN 挪到 `on_connect_ack` 处理器里:

```rust
impl ChatEventHandler for ConnectAckHandler {
    fn handle(&self, inner: &Arc<ChatInner>, payload: &Value) {
        // ...记录 user_info...
        // 服务器可能重复确认,只发送一次 JOIN
        if !inner.join_sent.swap(true, Ordering::AcqRel) {
            let _ = send_raw(inner, "42 [\"join\"]");
        }
    }
}
```

### 教训

**Socket.IO 类协议中,"连接确认"和"会话就绪"是两个不同的信号。** 握手成功(`40`)≠ 可以发业务消息。找到服务端的"就绪信号"(这里是 `on_connect_ack`)再行动,比 sleep 更可靠。

---

## 坑 7:`user_id` 以字符串返回

**严重度:★★。字段类型反直觉。**

### 现象

`join_ack` 明明 `code: 1` 成功,`get_user_info().user_id` 却是 `None`,导致测试误判"join 未成功"。

### 根因

```json
{ "code": 1, "data": { "user_id": "1742185446", "count": 1, "search_session": "..." } }
```

`user_id` 是**字符串** `"1742185446"`,而代码用 `Value::as_i64()` 解析 → 返回 `None`。

### 修复

```rust
let user_id = data.get("user_id").and_then(|v| {
    v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
});
```

### 教训

**服务器字段类型"看心情"**:同一个字段在不同接口里可能是 number 也可能是 string。解析时优先尝试数字、回退字符串,是最稳妥的写法。

---

## 坑 8:`41` 帧的语义因服务而异

**严重度:★★★。同一协议,两个服务两种语义。**

### 现象与对比

| 服务    | 收到 `41` 后的正确行为                                  | Python 原版做法            |
| ------- | ------------------------------------------------------- | -------------------------- |
| 云存储  | 服务器要求断开 → 清理连接、走重连                       | cloudcfg.py:清理并重新连接 |
| AI 对话 | 服务器**自动重建会话**,随后重新发 `40`/`on_connect_ack` | deepser.py:**直接忽略 41** |

### 踩坑

AI 对话端最初照搬云存储的 41 处理(清 `tx`、置 `connected=false`),结果服务器重建会话后我们已无法发送,join 流程彻底错乱。

### 修复

```rust
Frame::ServerClose => {
    // 服务器发 41 表示请求断开,但 WebSocket 层通常保持,服务器会重建会话
    // (Python 端同样忽略 41);不清理连接资源
    info!("收到服务器断开请求 (41)");
    Ok(())
}
```

### 教训

**协议移植必须逐服务验证,不能想当然复用另一端的处理。** 同一个帧,在一个服务里是"断开信号",在另一个服务里是"重建预告"。

---

## 坑 9:账号配额耗尽时服务器"静默拒绝"

**严重度:★★★★。超时错误的经典伪装。**

### 现象

AI 对话一切就绪后,发送 chat 消息:

```text
[发] 42 ["chat",{...}]
(此后 20 秒服务器零帧,连 ping 都不回)
[超时] AI 未开始回复
```

一度被判定为"chat 帧格式还有问题",继续排查协议。

### 根因

`on_connect_ack` 返回了关键信息:`"chat_count": 0`——**该账号剩余 AI 对话次数为 0**。服务器对配额不足的 chat 请求**直接无视,不回任何帧**(不是报错!)。换新账号(`chat_count: 1`)后,同样的代码立即成功并收到完整流式回复。

### 教训

1. **"服务器静默"≠"代码 bug"**:配额不足、格式错误都可能表现为"无响应"而非报错,超时是唯一信号;
2. **先看配额字段再查代码**:`on_connect_ack`/`join_ack` 里的 `chat_count`、`remaining_times` 就是体检报告;
3. 测试设计上,**把"账号/配额"变量隔离**——用已知有额度的账号做协议调试。

---

# 第二部分:并发/线程层(最隐蔽、最核心)

## 坑 10:读线程发送饥饿 —— 全项目最核心的坑

**严重度:★★★★★。这个问题值得单独成文(见附录),此处精讲。**

### 现象

AI 对话:join、preset 全部成功,唯独 chat 消息发出后 20 秒超时,服务器零帧。诡异的是,**同样的帧在握手阶段一切正常**——握手期服务器帧密集,chat 期服务器静默。

### 根因(三层叠加)

1. **tungstenite 同步 API 的独占性**:`WebSocket::send/read` 都要 `&mut self`,`read()` 无限阻塞,没有 `try_read()`,没有 `split()`——同一个 WebSocket 同时只能被一个线程持有;
2. **架构选型**:单线程事件循环 + mpsc channel 桥接外部发送:

```
┌─────────────┐   mpsc channel   ┌─────────────────────┐
│ 任意调用线程 │ ───────────────▶ │        读线程        │
│  send_event  │                  │  rx.recv_timeout()  │ ① 取待发消息
└─────────────┘                  │  ws.send(msg)        │ ② 发出
                                 │  ws.read()           │ ③ 读入站 ← 无限阻塞
                                 └─────────────────────┘
```

3. **时序灾难**:服务器静默期(握手帧发完,下一帧是 25 秒后的 ping),读线程卡死在 ③,永远回不到 ① → channel 里的 chat 帧发不出去 → 20 秒超时先到。

### 为什么"包 Mutex"或"双线程"都不行

- `Mutex<WebSocket>` 包两个线程:读线程**持锁阻塞在 `read()`**,发送线程拿不到锁——饥饿原封不动,只是换了名字;
- 发送线程直接 `ws.send()`:`WebSocket` 不实现 `Sync`,编译都过不了;
- 依赖服务器 ping:25 秒间隔远超业务超时,不可控。

### 修复:让 `read()` 自己会超时

```rust
/// 设置 WebSocket 底层流的读取超时(Plain 或 rustls 两种形态)。
fn set_stream_read_timeout(stream: &mut WsStream, timeout: Duration) -> std::io::Result<()> {
    match stream {
        MaybeTlsStream::Plain(s) => s.set_read_timeout(Some(timeout)),
        MaybeTlsStream::Rustls(owned) => owned.sock.set_read_timeout(Some(timeout)),
        _ => Ok(()),
    }
}

// establish() 中,连接建立后立即设置
let _ = set_stream_read_timeout(ws.get_mut(), Duration::from_millis(200));
```

`set_read_timeout` 底层是 `SO_RCVTIMEO`:内核保证 `recv` 最多阻塞 200ms,超时返回 `EAGAIN`(即 `WouldBlock`)。读循环把 `WouldBlock` 从"致命错误"改判为"该回去处理发送了":

```rust
match ws.read() {
    // ...
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

修复后,待发帧最坏 ~300ms 内必然发出(`recv_timeout` 100ms + read 超时 200ms)。

### 为什么安全(不丢数据)

1. **tungstenite 先缓冲**:`read()` 先把原始字节读进内部 `ReadBuffer` 再解析,`WouldBlock` 时半包字节安全留在缓冲区,下次续读;
2. **rustls 也有内部缓冲**:TLS 层已解密的剩余数据保留在 `conn` 内部;
3. `WouldBlock` 是"暂时没数据",不是错误,`continue` 重试语义正确。

### 真机验证

```text
[云变量] 私有 4 公有 9 列表 1, 在线 1     ← 修复前写操作有潜在延迟,修复后即时
[AI回复] > 思考如何满足用户需求……          ← chat 帧 300ms 内发出,流式回复完整
test result: ok. 2 passed; 0 failed
```

### 通用教训

**任何"单线程事件循环"式的同步网络代码,读操作必须有超时**——否则读与写无法共存,写方必然被读方饿死。这不是 tungstenite 的 bug,而是同步独占 API 的固有约束;`set_read_timeout + WouldBlock` 是约束内唯一干净的正解。

---

## 坑 11:Condvar 丢失唤醒

**严重度:★★★★。偶发超时,最磨人的一类。**

### 现象

`wait_for_connection(15s)` 偶尔在连接明明已建立时等到超时,复现率不高,极难定位。

### 根因

典型的 Condvar 丢失唤醒:

```
wait 线程:持锁检查 flag == false
         └─ 准备进入 wait_timeout(即将释放锁)
notify 线程:flag.store(true); cond.notify_all()   ← 此刻没有等待者,通知落空
wait 线程:进入 wait_timeout(释放锁,开始等待)       ← 永远等不到
```

`flag` 是 `AtomicBool`,`notify_all` 不持锁 → 存在"wait 已检查、尚未等待"的窗口,通知丢失。

### 修复

封装 `notify_with`:持锁设标志再通知,与 `wait_flag` 的"持锁检查-等待"原子性配合:

```rust
impl Notify {
    fn notify_with<R>(&self, f: impl FnOnce() -> R) -> R {
        let _guard = self.lock.lock().unwrap();
        let result = f();
        self.cond.notify_all();
        result
    }
}
```

所有"置标志 + 通知"点(`connected`、`data_ready`、`receiving`)统一走 `notify_with`;`wait_flag` 保持"持锁检查 flag → wait_timeout"的结构。两个互斥锁配对,唤醒不再丢失。

### 教训

**Condvar 的使用铁律:标志的写入与通知必须在同一把锁内完成,标志的检查与等待也必须在同一把锁内完成。** 任何一边不持锁,都有丢失唤醒窗口。

---

## 坑 12:快速回复竞态(状态型等待误报超时)

**严重度:★★★★。纯状态布尔值做等待条件的固有缺陷。**

### 现象

`send_and_wait` 偶发超时,但服务器明明回复了。时序:

```
t=0    send_message() 发送 chat
t=1    AI 极快:Begin + 全部 Chunk + End 全部完成,receiving 回到 false
t=1.1 wait_for_response_start() 开始等待
       —— 条件 "receiving == true" 永远不成立(已经结束了!)
       —— 等到超时
```

### 根因

`receiving` 是布尔状态,不是事件。等待"状态变为 true"的线程,如果状态**在它开始等之前已经变过又变回**,就会永远错过。

### 修复:回合计数

```rust
// 发送消息时递增回合
self.inner.pending_round.fetch_add(1, Ordering::AcqRel);

// 收到 stream_output_begin 时,把"已完成回合"快照到当前回合
inner.completed_round.store(inner.pending_round.load(Ordering::Acquire), Ordering::Release);

// 等待条件:正在接收,或本回合已完成(哪怕已经结束)
let target = self.inner.pending_round.load(Ordering::Acquire);
wait_flag(..., || {
    let receiving = self.inner.receiving.load(Ordering::Acquire);
    if target == 0 { return receiving; }
    receiving || self.inner.completed_round.load(Ordering::Acquire) >= target
})
```

### 教训

**等待"是否发生过"要用计数/序号,不能用布尔状态。** 布尔适合表达"当前状态",不适合表达"曾经发生过"。

---

## 坑 13:回调不能在锁内执行

**严重度:★★★★★。并发安全的地基。**

### 风险

若在持有 `Mutex<DataStore>` 时调用用户回调:

1. 回调里再调用 `get()`/`set()` → **重入同一把 std Mutex → 直接死锁**(std Mutex 不可重入);
2. 回调 panic → 锁被污染(`PoisonError`),后续所有访问报错。

### 修复:取走 → 释放锁 → 锁外执行 → 放回

```rust
let callbacks = {
    let mut store = inner.state.lock().unwrap();
    match store.variable_mut(kind, key) {
        Some(v) => std::mem::take(&mut v.callbacks),   // 取出
        None => return,
    }
};
for (_, cb) in &callbacks {
    let _ = catch_unwind(AssertUnwindSafe(|| cb(old, new, source)));  // 锁外执行
}
if let Some(v) = inner.state.lock().unwrap().variable_mut(kind, key) {
    v.callbacks.extend(callbacks);   // 放回(执行期间新注册的也保留)
}
```

注意:`release` profile 是 `panic = "abort"`,`catch_unwind` 在 release 下无效——**文档必须注明"回调不应 panic"**。

### 教训

**回调(用户代码)永远在锁外、在读线程的临界区之外执行;锁内只做数据搬运,不做任何用户代码调用。** 这条规则配合 `std::mem::take` 模式,是 Rust 里"存回调 + 安全触发"的标准姿势。

---

## 坑 14:回调内调用 `close()` 会死锁

**严重度:★★★。文档级防护。**

### 风险

回调在连接**读线程**内执行;`close()` 里会 `read_join.join()`——**join 自身线程**,死锁。

### 处理

```rust
/// 关闭连接并清理资源。
///
/// 注意:请勿在回调(如 `on_data_ready`)中调用本方法——回调在连接读线程内执行,
/// 调用 `close()` 会 join 自身线程导致死锁。
pub fn close(&self) { ... }
```

### 教训

**线程亲和性必须写进 API 文档**:回调运行在哪个线程、哪些方法不能在其中调用,是这类库的隐性契约。

---

## 坑 15:`connect()` 与自动重连并发 establish

**严重度:★★★★。线程泄漏级隐患。**

### 风险

- `connect()`(用户主动)与读线程断线后的自动重连可能**同时**执行 `establish()`;
- 后执行的 `establish()` 覆盖 `inner.tx`,产生**两个读线程**;
- `close()` 只 join 一个,另一个线程泄漏,且两个读线程争抢同一个 `WebSocket`。

### 修复

```rust
// CloudInner 增加
connect_lock: Mutex<()>,

// establish() 开头
fn establish(inner: &Arc<CloudInner>) -> Result<()> {
    // 串行化建立过程,避免 connect() 与自动重连竞态产生双读线程
    let _connect_guard = inner.connect_lock.lock().unwrap();
    ...
}
```

### 教训

**"建立连接"这类副作用操作必须串行化**。两个入口(用户主动、后台自动)都可能触发时,一把互斥锁是最简单的正确性保证。

---

## 坑 16:重连失败只试一次

**严重度:★★★★。网络抖动时的可用性杀手。**

### 现象

断线后 `on_connection_lost` 里 `establish()` 失败(比如网络暂时不通),代码 `warn!` 后结束——但**连接已断,不会再触发新的"连接丢失"事件**,重试机会永远丢失。

### 修复:退避循环

```rust
let mut attempts = 0;
loop {
    attempts += 1;
    if attempts > inner.max_reconnect_attempts {
        warn!("已达最大重连次数 ({}), 停止重连", inner.max_reconnect_attempts);
        return;
    }
    let delay = inner.reconnect_interval.saturating_mul(1u32 << (attempts - 1).min(5));
    thread::sleep(delay.min(Duration::from_secs(300)));
    if inner.stopping.load(Ordering::Acquire) {
        return;
    }
    match establish(&inner) {
        Ok(()) => { info!("重连成功(第 {attempts} 次)"); return; }
        Err(e) => warn!("第 {attempts} 次重连失败: {e}"),
    }
}
```

### 教训

**"失败即返回"只适用于有外部重试驱动的场景;自驱动重试必须自己循环。** 指数退避 + 上限 + 可停止(检查 `stopping`)三要素缺一不可。

---

## 坑 17:flush 在 Socket.IO 握手完成前发消息

**严重度:★★★★。与坑 18 是一对。**

### 风险

`connected`(WebSocket 建立)早于 Socket.IO 握手完成。批量上传线程只看 `connected`,可能在握手完成前把命令发出去 → 服务器丢弃 → 命令已 drain 不回填 → **数据静默丢失**。

### 修复

```rust
// CloudInner 增加 io_ready: AtomicBool
// 收到 40 时置位;establish/reset/on_connection_lost 时清零

if !inner.connected.load(Ordering::Acquire)
    || !inner.io_ready.load(Ordering::Acquire)
{
    // 未就绪:命令保留待补发
    for cmd in batch.into_iter().rev() {
        queue.push_front(cmd);
    }
    continue;
}
```

### 教训

**"连接建立"与"可以发业务数据"是两个时刻**。中间隔着 Socket.IO 握手(`0` → `40`),用独立的 `io_ready` 标志表达,而不是复用 `connected`。

---

## 坑 18:断线期间命令被丢弃

**严重度:★★★★。数据一致性 bug。**

### 现象

flush 线程在 `!connected` 时 drain 队列后直接丢弃——断线/重连窗口内,本地已生效的 `set_*` 云端永远收不到。

### 修复

未连接时把命令**逆序放回队头**(保持 FIFO):

```rust
for cmd in batch.into_iter().rev() {
    queue.push_front(cmd);
}
```

与坑 17 合并后:未连接、未握手、发送失败三种情况,命令都保留,连接恢复后补发;只有 `close()` 才清空队列(用户主动放弃)。

### 教训

**队列语义:消费失败必须回滚,而不是丢弃。** "发出去才算数"是消息队列的底线,批量上传也不例外。

---

# 第三部分:编译/类型层(磨人的小妖精)

## 坑 19:`cargo build --lib` 假成功

**严重度:★★★★★。让"编译通过"成为假象。**

### 现象

`cargo build --lib` 显示成功,`cargo test` 却爆出 17 个编译错误,而且错误全在新写的模块里。

### 根因

`src/lib.rs` 是**空的**——模块全部声明在 `src/main.rs`(bin target)里。`--lib` 编译的是空的 cdylib,自然"成功";真正的代码直到编译 bin 才被检查。

### 修复

```rust
// src/lib.rs
pub mod api;
pub mod core;
pub mod utils;
```

同时在 `Cargo.toml` 的 `crate-type` 加 `"rlib"`,让库可被测试引用。

### 教训

**先确认"编译通过的到底是不是你写的代码"。** 空的 lib + 装满代码的 bin,是"假成功"的经典配方。

---

## 坑 20:`cargo test --lib` 显示 0 个测试

**严重度:★★★。**

### 现象

`cargo test --lib` 输出 `running 0 tests`,单元测试一个都没跑。

### 根因

`crate-type = ["cdylib"]` 的库不参与测试(测试需要 rlib)。加了 `"rlib"` 后测试才运行。

### 教训

**`crate-type` 决定可测性**。想用 `cargo test` 验证库代码,必须有 `rlib` 目标。

---

## 坑 21:传递依赖不能直接 `use`

**严重度:★★★。**

### 现象

```rust
use http::HeaderValue;   // E0432: unresolved import
```

### 根因

`http`、`url` 是 tungstenite 的**传递依赖**。Rust 2018+ 要求直接 `use` 的 crate 必须在 `Cargo.toml` 显式声明(即使它已在 `Cargo.lock` 里)。

### 修复

```toml
http = "1"     # 版本与 lock 一致,不新增下载
url = "2"
```

### 教训

**"在依赖树里" ≠ "可以直接 use"**。要用就显式声明,版本与 lock 对齐即可。

---

## 坑 22:`.lock().unwrap()` 的 `Debug` 约束

**严重度:★★★★。报错信息极具误导性。**

### 现象

```rust
self.state.lock().unwrap()   // error: CloudInner doesn't implement Debug
```

报错点名了无关类型。

### 根因

`unwrap()` 要求 `E: Debug`,而 `E = PoisonError<MutexGuard<T>>`,它要求 `T: Debug`。`T` 是含 `Box<dyn Fn>` 的数据结构,无法 derive `Debug`。

### 修复

为含闭包的类型手动实现 `Debug`(跳过闭包字段):

```rust
impl<T> std::fmt::Debug for CallbackStore<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CallbackStore")
            .field("next_id", &self.next_id)
            .field("count", &self.items.len())
            .finish()
    }
}
```

凡是 `Mutex<T>` 会被 `unwrap()` 的 `T`,都需要 `Debug`。逐个补:数据存储、回调存储、内部状态。

### 教训

**Rust 的 `unwrap` 错误链会把不相干的类型拖下水。** 看到 `X doesn't implement Debug` 时,先想"哪个 Mutex 的 T 缺 Debug",而不是 X 本身。

---

## 坑 23:借用检查 E0499(两个 `&mut self` 字段)

**严重度:★★★。**

### 现象

```rust
fn variable_in(&'a mut self, vars: &'a mut ..., cvid: &...) -> ... {
    // 同时可变借用 self.variable_in 的参数和 self 的另一个字段
}
// error[E0499]: cannot borrow `*self` as mutable more than once
```

### 修复

改成**不带 `&mut self` 的关联函数**,只借具体字段:

```rust
fn variable_mut(&mut self, kind: VarKind, key: &str) -> Option<&mut VariableData> {
    match kind {
        VarKind::Private => Self::variable_in(&mut self.private_vars, &self.private_cvid, key),
        VarKind::Public => Self::variable_in(&mut self.public_vars, &self.public_cvid, key),
    }
}

fn variable_in<'a>(
    vars: &'a mut HashMap<String, VariableData>,
    cvid: &HashMap<String, String>,
    key: &str,
) -> Option<&'a mut VariableData> { ... }
```

字段级借用合法;整体 `&mut self` + 内部字段借用非法。

### 教训

**`&mut self` 是"整对象可变借用",想同时借两个字段就把它拆成参数。** 关联函数(不接收 self)是绕过 E0499 的标准手法。

---

## 坑 24:use-after-move

**严重度:★★。**

### 现象

```rust
for (cvid, ops) in merged.list_updates { ... }   // 消费
debug!("...{}", merged.list_updates.len());       // E0382: borrow of moved value
```

### 修复

循环前先取长度:

```rust
let list_count = merged.list_updates.len();
for (cvid, ops) in merged.list_updates { ... }
debug!("... 列表 {list_count}");
```

### 教训

**循环消费(by value)之后不能再引用容器本身。** 需要长度/计数时先取出。

---

## 坑 25:回调签名不统一

**严重度:★★★。**

### 现象

- `on_ranking_received(cb: impl Fn(RankingData))` 存入 `Box<dyn Fn(&RankingData)>` → 类型不匹配;
- 列表"整表变更回调"误用了"单值变更回调"别名 → 参数类型不匹配。

### 修复

回调**按值/按引用全链路统一**;列表单独定义别名:

```rust
type RankingCallback = Box<dyn Fn(RankingData) + Send + Sync>;
type ListChangeCallback = Box<dyn Fn(&[CloudValue], &[CloudValue], &str) + Send + Sync>;
```

### 教训

**回调签名是"公共 API 的一部分",一经定义全链路一致**。值传递(触发方 clone)或引用传递(触发方借),选一个,不要在存储和公开方法两侧各写各的。

---

# 第四部分:调试方法论(让我们成功的关键)

1. **把帧流打出来,与 Python 原版逐字对比**。这是定位坑 3/5/6 的决定性手段:每次收发帧都打日志,与 `cloudcfg.py`/`deepser.py` 的发送字符串逐字节 diff。`diff` 一个空格就能救回半天时间。
2. **挂 `log::Log` 输出,用 `LevelFilter::Debug` 看全量日志**。测试进程没有 logger 时,`log` 宏默认静默,容易误以为"什么都没发生"。测试入口加一个最小 logger,是所有网络调试的第一步。
3. **二分定位顺序**:完整请求 URL(含 query)→ headers → 签名 → token 时效 → **最后才怀疑 TLS**。坑 1 就是跳过了第一步直接挖 TLS,多花了数倍时间。
4. **区分账号问题与代码问题**:服务器静默(坑 9)是超时的常见伪装。先看 `chat_count`、`remaining_times` 等配额字段,再查代码。
5. **Python 对照探针的陷阱**:用标准库手写 WS 客户端做对照时,发现"同帧同时序下 Python 探针被断、Rust 成功",排除协议差异后疑为 **rustls 与 OpenSSL 的 TLS 指纹差异**导致服务器对探针有不同行为——**不要用探针的失败否定主实现**,以真实目标客户端的实测为准。
6. **临时 smoke 测试 + 真实账号验证,验证后删除**:真机冒烟测试(只读云变量、实际对话)是协议正确性的最终裁判;但账号凭据不能进仓库,测完即删。

---

# 结语:三条最值钱的教训

1. **协议移植,先复刻"字面量"再谈优化**:帧格式的空格、payload 有无、事件时序、字段类型(字符串 user_id)全是坑,必须与 Python 原版逐字节对齐;
2. **同步网络代码,读必须有超时**:单线程事件循环下,`read()` 无限阻塞必然饿死发送通道——这是坑 10 的本质,也是全项目最核心的教训;
3. **HTTP 层错误,归因要按协议分层校准**:能收到 HTTP 响应 ⇒ TLS 已经成功 ⇒ 问题在业务层(URL 参数/凭证),不在 TLS 指纹——坑 1 用数倍时间换来的结论。

---

## 附录:坑 10 全文——《一次被 `ws.read()` 卡死的发送》

完整版见姊妹篇:[《一次被 ws.read() 卡死的发送:同步 WebSocket 客户端的"读阻塞 vs 写饥饿"之殇》](/posts/ws-read-blocking-write-starvation)。

(正文坑 10 已含全部要点:现象、三层根因、Mutex/双线程为何不行、`set_read_timeout + WouldBlock` 修复、不丢数据的三层保证、真机验证、`tokio-tungstenite` 备选方案。)
