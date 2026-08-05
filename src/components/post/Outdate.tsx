import { useEffect, useState } from 'react'
import { getDiffInDays, getFormattedDate } from '@/utils/date'

export function Outdate({ lastMod }: { lastMod: Date }) {
  const [isShow, setIsShow] = useState(false)

  useEffect(() => {
    const diffDays = getDiffInDays(lastMod)
    if (diffDays > 30) {
      setIsShow(true)
    }
  }, [lastMod])

  // isShow 只可能 false→true（永不复位），退场动画无需处理；
  // 入场动画由 CSS 实现（fade-in-up）
  if (!isShow) return null

  return (
    <div className="outdate-in flex justify-center text-sm p-4 rounded-lg bg-amber-300/10 border border-amber-300">
      <span>
        这篇文章最后修改于 {getFormattedDate(lastMod)}，部分内容可能已经不适用，如有疑问可联系作者。
      </span>
    </div>
  )
}
