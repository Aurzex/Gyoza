import { useLayoutEffect, useRef } from 'react'

const threshold = 60
const range = 60
/** 滚动停止后恢复高保真模糊的延迟（ms） */
const BLUR_RESTORE_DELAY = 150

/**
 * header 背景透明度随滚动渐显。
 *
 * 性能设计：
 * - 透明度是连续视觉状态，用命令式 DOM 更新（rAF 节流 + 直接写 style.opacity），
 *   组件零重渲染；
 * - backdrop-filter 是昂贵的 GPU 操作（fixed 元素在滚动时每帧重采样模糊），
 *   滚动过程中降级为低半径模糊（.is-scrolling），停止 150ms 后恢复高保真。
 */
export function BluredBackground() {
  const backgroundRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const $background = backgroundRef.current
    if (!$background) return

    let rafId = 0
    let restoreTimer = 0

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

      // 滚动中降级 blur，停止后恢复
      $background.classList.add('is-scrolling')
      clearTimeout(restoreTimer)
      restoreTimer = window.setTimeout(() => {
        $background.classList.remove('is-scrolling')
      }, BLUR_RESTORE_DELAY)
    }

    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(restoreTimer)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={backgroundRef}
      className="header-bg absolute inset-0 -z-1 border-b border-primary bg-white/70 dark:bg-zinc-800/70 transform-gpu"
      style={{ opacity: 0 }}
    />
  )
}
