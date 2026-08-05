import { useLayoutEffect, useRef } from 'react'
import { useSetAtom } from 'jotai'
import {
  pageScrollDirectionAtom,
  isHeaderScrolledAtom,
  isAccessibleMenuScrolledAtom,
  isBackToTopVisibleAtom,
} from '@/store/scrollInfo'

const HEADER_THRESHOLD = 60
const ACCESSIBLE_THRESHOLD = 400
const BACK_TO_TOP_THRESHOLD = 100

/**
 * 滚动信息提供者。
 *
 * 性能设计：原生 scroll 事件经 requestAnimationFrame 节流（比定时器
 * throttle 更平滑），且只在离散状态翻转时才写入 jotai，滚动过程中
 * React 侧几乎零重渲染。连续的滚动位置不再进入状态——需要连续视觉
 * 的组件（header 背景透明度、阅读进度）改为命令式 DOM 更新。
 */
export function PageScrollInfoProvider() {
  const setScrollDirection = useSetAtom(pageScrollDirectionAtom)
  const setIsHeaderScrolled = useSetAtom(isHeaderScrolledAtom)
  const setIsAccessibleMenuScrolled = useSetAtom(isAccessibleMenuScrolledAtom)
  const setIsBackToTopVisible = useSetAtom(isBackToTopVisibleAtom)

  const prevScrollY = useRef(0)
  const prevDirection = useRef<'up' | 'down' | null>(null)
  const prevHeaderScrolled = useRef(false)
  const prevAccessibleScrolled = useRef(false)
  const prevBackToTopVisible = useRef(false)

  useLayoutEffect(() => {
    let rafId = 0

    const getScrollTop = () => {
      let currentTop = document.documentElement.scrollTop
      if (currentTop === 0) {
        // 菜单打开时 body 被 position:fixed 锁定，滚动值在 body.style.top 里
        const bodyStyle = document.body.style
        if (bodyStyle.position === 'fixed') {
          currentTop = Math.abs(parseInt(bodyStyle.top, 10))
        }
      }
      return currentTop
    }

    const update = () => {
      rafId = 0
      const currentTop = getScrollTop()

      const direction: 'up' | 'down' = prevScrollY.current - currentTop > 0 ? 'up' : 'down'
      prevScrollY.current = currentTop

      if (direction !== prevDirection.current) {
        prevDirection.current = direction
        setScrollDirection(direction)
      }

      const headerScrolled = currentTop >= HEADER_THRESHOLD
      if (headerScrolled !== prevHeaderScrolled.current) {
        prevHeaderScrolled.current = headerScrolled
        setIsHeaderScrolled(headerScrolled)
      }

      const accessibleScrolled = currentTop >= ACCESSIBLE_THRESHOLD
      if (accessibleScrolled !== prevAccessibleScrolled.current) {
        prevAccessibleScrolled.current = accessibleScrolled
        setIsAccessibleMenuScrolled(accessibleScrolled)
      }

      const backToTopVisible = currentTop > BACK_TO_TOP_THRESHOLD
      if (backToTopVisible !== prevBackToTopVisible.current) {
        prevBackToTopVisible.current = backToTopVisible
        setIsBackToTopVisible(backToTopVisible)
      }
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
  }, [setScrollDirection, setIsHeaderScrolled, setIsAccessibleMenuScrolled, setIsBackToTopVisible])

  return null
}
