import { useLayoutEffect, useRef } from 'react'

const threshold = 60
const range = 60

/**
 * header 背景透明度随滚动渐显。
 *
 * 性能设计：透明度是连续视觉状态，用命令式 DOM 更新（rAF 节流 +
 * 直接写 style.opacity），组件零重渲染。
 */
export function BluredBackground() {
  const backgroundRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const $background = backgroundRef.current
    if (!$background) return

    let rafId = 0
    const update = () => {
      rafId = 0
      const scrollY = window.scrollY ?? document.documentElement.scrollTop
      let opacity: number
      if (scrollY >= threshold + range) {
        opacity = 1
      } else if (scrollY <= threshold) {
        opacity = 0
      } else {
        opacity = (scrollY - threshold) / range
      }
      $background.style.opacity = opacity.toFixed(2)
    }

    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={backgroundRef}
      className="absolute inset-0 -z-1 border-b border-primary bg-white/70 dark:bg-zinc-800/70 backdrop-saturate-150 backdrop-blur-lg transform-gpu"
      style={{ opacity: 0 }}
    />
  )
}
