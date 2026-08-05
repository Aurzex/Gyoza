import { useEffect, useRef, useState } from 'react'

/**
 * 手写体 "Aurzex" 签名。
 *
 * - 自绘 6 个字母的笔画 path（手写连笔风格），stroke 用 currentColor
 *   随全局主题色变化（--color-text-secondary）
 * - 每笔 pathLength=1 + stroke-dasharray 动画，进入视口后按书写顺序
 *   逐步显示笔迹（IntersectionObserver 触发，仅一次）
 * - 纯 GPU 合成属性（stroke-dashoffset），无 JS 重渲染
 */
const LETTER_PATHS = [
  // A：左斜 + 右斜 + 横
  'M30 95 C36 58 40 30 44 16 C48 32 54 62 60 95 M36 62 L56 62',
  // u
  'M72 95 C72 62 72 45 80 45 C88 45 90 60 90 95',
  // r：竖 + 小弧肩
  'M102 95 L102 50 C102 42 110 42 110 48 C110 56 102 62 102 62',
  // z
  'M124 48 L152 48 L124 88 L152 88',
  // e
  'M176 70 C168 52 162 48 160 56 C158 64 162 78 172 78 C182 78 186 66 184 58',
  // x：交叉两笔
  'M200 50 L228 88 M228 50 L200 88',
]

export function AnimatedSignature() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    const $root = rootRef.current
    if (!$root) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsDrawing(true)
          observer.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    observer.observe($root)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="animated-signature" aria-hidden>
      <svg viewBox="0 0 260 110" className={isDrawing ? 'is-drawing' : ''}>
        {LETTER_PATHS.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="sig-stroke"
            style={{ animationDelay: `${index * 0.25}s` }}
          />
        ))}
      </svg>
    </div>
  )
}
