import { useEffect, useRef, useState } from 'react'
import { getDaysInYear, getDiffInDays, getStartOfDay, getStartOfYear } from '@/utils/date'

/**
 * 年度/当日进度。
 *
 * SSR 优先：初始值由构建时（archives.astro 传入 initialDate）渲染，
 * 水合后每秒增量更新。
 */
export function TimelineProgress({ initialDate }: { initialDate: Date }) {
  const [now, setNow] = useState(initialDate)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const currentYear = now.getFullYear()
  const pastDays = getDiffInDays(getStartOfYear(now), now)
  const percentOfYear = (pastDays / getDaysInYear(now)) * 100
  const percentOfToday = ((now.getTime() - getStartOfDay(now).getTime()) / 86400 / 1000) * 100

  return (
    <>
      <p className="mt-4">
        今天是 {currentYear} 年的第 <CountUp to={pastDays} decimals={0} /> 天
      </p>
      <p className="mt-4">
        今年已过 <CountUp to={percentOfYear} decimals={5} />%
      </p>
      <p className="mt-4">
        今天已过 <CountUp to={percentOfToday} decimals={5} />%
      </p>
    </>
  )
}

/** 轻量数字滚动动画（rAF 实现，替代 framer-motion 的 animate） */
function animateValue(from: number, to: number, duration: number, onUpdate: (v: number) => void) {
  const startTime = performance.now()
  let rafId = 0

  const tick = (time: number) => {
    const progress = Math.min((time - startTime) / (duration * 1000), 1)
    const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
    onUpdate(from + (to - from) * eased)
    if (progress < 1) {
      rafId = requestAnimationFrame(tick)
    }
  }

  rafId = requestAnimationFrame(tick)
  return {
    stop() {
      cancelAnimationFrame(rafId)
    },
  }
}

function CountUp({
  to,
  decimals,
  duration = 1,
}: {
  to: number
  decimals: number
  duration?: number
}) {
  const node = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)

  useEffect(() => {
    if (!node.current) return

    const control = animateValue(prev.current, to, duration, (value) => {
      if (node.current) {
        node.current.textContent = value.toFixed(decimals)
      }
    })
    prev.current = to

    return () => {
      control.stop()
    }
  }, [to, decimals, duration])

  return <span ref={node}></span>
}
