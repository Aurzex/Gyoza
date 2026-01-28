import { useEffect, useRef } from 'react'
import { init } from '@waline/client'
import '@waline/client/style'

export function Waline({ serverURL }: { serverURL: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const locale = {
      nick: '请告诉人家你的名字喵~',
      nickError: '昵称太短了啦，至少要3个字符哦喵！',
      mail: '邮箱地址喵~',
      mailError: '邮箱格式不对呢，请重新填写喵~',
      link: '你的网站喵（选填）',
      optional: '可以不填喵~',
      placeholder: '有什么想说的都可以告诉人家喵~',
      sofa: '还没有评论呢，快来第一个留言喵！',
      submit: '发送喵！',
      like: '喜欢喵❤',
      cancelLike: '不喜欢了喵…',
      reply: '回复喵~',
      cancelReply: '不回复了喵',
      comment: '评论喵',
      refresh: '刷新一下喵',
      more: '加载更多评论喵...',
      preview: '先看看效果喵',
      emoji: '选个表情喵~',
      uploadImage: '上传图片喵',
      seconds: '秒前喵',
      minutes: '分钟前喵',
      hours: '小时前喵',
      days: '天前喵',
      now: '刚刚喵~',
      uploading: '正在上传喵，稍等哦~',
      login: '登录喵',
      logout: '退出喵',
      admin: '博主大人喵',
      sticky: '置顶喵',
      word: '字喵',
      wordHint: '评论要在 $0 到 $1 字之间喵！\n现在已经写了 $2 字了喵~',
      anonymous: '匿名喵',
      level0: '潜水喵',
      level1: '冒泡喵',
      level2: '吐槽喵',
      level3: '活跃喵',
      level4: '话痨喵',
      level5: '传说喵',
      gif: '表情包喵',
      gifSearchPlaceholder: '搜搜想要的表情包喵~',
      profile: '个人资料喵',
      approved: '通过审核了喵~',
      waiting: '等待审核喵…',
      spam: '垃圾评论喵！',
      unsticky: '取消置顶喵',
      oldest: '从旧到新喵',
      latest: '从新到旧喵',
      hottest: '按热度排喵',
      reactionTitle: '你觉得这篇文章怎么样喵？',
    }

    const walineInst = init({
      el: ref.current,
      serverURL,
      dark: "[data-theme='dark']",
      login: 'enable',
      imageUploader: false,
      search: false,
      reaction: true,
      locale: locale,
      emoji: [
        '//unpkg.com/@waline/emojis@1.4.0/bilibili',
        '//unpkg.com/@waline/emojis@1.4.0/bmoji',
      ],
    })

    return () => {
      if (ref.current) {
        walineInst?.destroy()
      }
    }
  }, [serverURL])

  return <div ref={ref}></div>
}
