import { pageScrollDirectionAtom } from '@/store/scrollInfo'
import type { MarkdownHeading } from 'astro'
import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { memo, useEffect, useRef, useState } from 'react'

/** 检测线位置（视口顶部，px） */
const DETECT_LINE = 80

function useActiveItem() {
  const [activeItem, setActiveItem] = useState('')
  const activeRef = useRef('')

  useEffect(() => {
    const $article = document.querySelector('#markdown-wrapper')
    if (!$article) return
    const $headings = Array.from($article.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    if ($headings.length === 0) return

    const setActive = (id: string) => {
      if (activeRef.current !== id) {
        activeRef.current = id
        setActiveItem(id)
      }
    }

    // 标准 scrollspy 语义：高亮"检测线（视口顶部 80px）之上最近"的标题，
    // 即最后滚过检测线的标题。与旧实现（取检测区内 index 最小的标题）
    // 不同，多个相同/密集排列的标题同时出现在视口内时，目录指针
    // 也能正确跟随当前阅读位置。
    const updateActive = () => {
      let bestIndex = -1
      let best: Element | null = null
      for (let i = 0; i < $headings.length; i++) {
        const rect = $headings[i].getBoundingClientRect()
        if (rect.top <= DETECT_LINE) {
          bestIndex = i
          best = $headings[i]
        }
      }
      // 页面顶部尚未滚动到任何标题：高亮第一个
      if (bestIndex === -1) {
        best = $headings[0]
      }
      if (best) setActive(best.id)
    }

    // 检测区 = 视口顶部 80px 线以下的区域；标题与检测区交叉状态
    // 变化时触发更新（仅滚动经过标题时回调，非逐帧）
    const observer = new IntersectionObserver(updateActive, {
      rootMargin: `-${DETECT_LINE}px 0px -1px 0px`,
    })
    $headings.forEach((heading) => observer.observe(heading))
    updateActive()
    return () => {
      observer.disconnect()
    }
  }, [])

  return activeItem
}

export function PostToc({ headings }: { headings: MarkdownHeading[] }) {
  const activeItem = useActiveItem()

  return (
    <ul
      className="relative overflow-y-auto space-y-2 group text-sm"
      style={{
        maxHeight: 'min(380px, calc(100vh - 250px))',
        scrollbarWidth: 'none',
      }}
    >
      {headings.map((item) => (
        <TocItem
          key={item.slug}
          slug={item.slug}
          text={item.text}
          depth={item.depth}
          isActive={item.slug === activeItem}
        />
      ))}
    </ul>
  )
}

/**
 * memo：active 项变化时只有对应条目重渲染，
 * 避免整棵 TOC 列表（可能十几项）在每次高亮切换时全部 reconcile。
 */
export const TocItem = memo(function TocItem({
  slug,
  text,
  depth,
  isActive,
}: {
  slug: string
  text: string
  depth: number
  isActive: boolean
}) {
  const itemRef = useRef<HTMLLIElement>(null)
  const scrollDirection = useAtomValue(pageScrollDirectionAtom)

  useEffect(() => {
    if (!isActive) return
    const $item = itemRef.current
    if (!$item) return
    const $container = $item.parentElement
    if (!$container) return

    const containerHeight = $container.clientHeight
    const itemHeight = $item.clientHeight
    const itemOffsetTop = $item.offsetTop
    const scrollTop = $container.scrollTop

    const itemTop = itemOffsetTop - scrollTop
    const itemBottom = itemTop + itemHeight

    if (itemTop < 0 || itemBottom > containerHeight) {
      if (scrollDirection === 'up') {
        $container.scrollTop = itemOffsetTop - containerHeight + itemHeight
      } else {
        $container.scrollTop = itemOffsetTop
      }
    }
  }, [isActive])

  return (
    <li className="relative" ref={itemRef}>
      <span
        className={clsx(
          'absolute left-0 top-2 h-1 rounded-full',
          isActive ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-700'
        )}
        style={{ width: `${4 * (7 - depth)}px` }}
      ></span>
      <a
        className={clsx(
          'inline-block pl-8 opacity-0 transition-opacity duration-300',
          isActive
            ? 'opacity-100'
            : 'group-hover:opacity-100 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
        )}
        href={`#${slug}`}
      >
        <span>{text}</span>
      </a>
    </li>
  )
})
