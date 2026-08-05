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

    // IntersectionObserver：标题进入"检测线下方区域"时回调，浏览器原生、
    // 无强制 reflow，且只在可见性变化时触发（替代滚动时逐帧 getBoundingClientRect）
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return

        // 取文档顺序中最靠前的一个作为活跃标题
        let bestIndex = Infinity
        let bestId = ''
        for (const entry of visible) {
          const index = $headings.indexOf(entry.target)
          if (index !== -1 && index < bestIndex) {
            bestIndex = index
            bestId = entry.target.id
          }
        }
        if (bestId) setActive(bestId)
      },
      { rootMargin: `-${DETECT_LINE}px 0px -70% 0px` }
    )

    $headings.forEach((heading) => observer.observe(heading))
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
