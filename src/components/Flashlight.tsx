import { useLayoutEffect, useRef } from 'react'

/**
 * 手电筒暗角效果。
 *
 * 性能设计：鼠标位置是高频连续状态，如果每次 mousemove 都 setState，
 * 会触发整层全屏 overlay 的 React 重渲染。这里采用命令式 DOM 更新：
 * mousemove 经 requestAnimationFrame 节流后直接写入 CSS 自定义属性，
 * 组件自身零重渲染（div 只渲染一次）。
 */
export function Flashlight() {
  const overlayRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const $overlay = overlayRef.current
    if (!$overlay) return

    // 触屏设备或无 hover 能力时不启用
    if (!window.matchMedia('(hover: hover)').matches) {
      $overlay.style.display = 'none'
      return
    }

    let rafId = 0
    const handleMouseMove = (event: MouseEvent) => {
      // rAF 节流：一帧内只写一次
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        $overlay.style.setProperty('--cursor-x', `${event.clientX}px`)
        $overlay.style.setProperty('--cursor-y', `${event.clientY}px`)
      })
    }

    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="fixed inset-0 z-50 pointer-events-none"
      style={{
        backgroundImage:
          'radial-gradient(circle 16vmax at var(--cursor-x, 50vw) var(--cursor-y, 50vh), rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 80%, rgba(0, 0, 0, 0.8) 100%)',
      }}
    />
  )
}
