import { useLayoutEffect, useRef } from 'react'

/**
 * 阅读进度指示。
 *
 * 性能设计：百分比是连续视觉状态，采用命令式 DOM 更新——DOM 几何在
 * 挂载时测量一次（窗口变化时重新测量），滚动经 rAF 节流后直接写文本，
 * 组件零重渲染。
 */
export function ReadingProgress() {
  const textRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const $text = textRef.current
    if (!$text) return

    let fullHeight = 0
    const $article = document.querySelector('#markdown-wrapper')

    const measure = () => {
      if (!$article) return
      const { offsetHeight, offsetTop } = $article as HTMLElement
      fullHeight = offsetHeight + offsetTop - window.innerHeight
    }
    measure()

    let rafId = 0
    const update = () => {
      rafId = 0
      if (fullHeight <= 0) return
      const scrollY = window.scrollY ?? document.documentElement.scrollTop
      const percent = scrollY > fullHeight ? 100 : Math.floor((scrollY / fullHeight) * 100)
      $text.textContent = `进度 ${percent}%`
    }

    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(update)
    }

    const onResize = () => {
      measure()
      update()
    }

    const resizeObserver = new ResizeObserver(onResize)
    if ($article) resizeObserver.observe($article)

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (rafId) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div>
      <span ref={textRef} className="text-sm">
        进度 0%
      </span>
    </div>
  )
}
