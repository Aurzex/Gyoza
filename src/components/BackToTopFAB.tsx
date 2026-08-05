import { useAtomValue } from 'jotai'
import { isBackToTopVisibleAtom } from '@/store/scrollInfo'
import clsx from 'clsx'

export function BackToTopFAB() {
  // 离散状态：仅当跨过 100px 阈值时更新，滚动过程不重渲染
  const isShow = useAtomValue(isBackToTopVisibleAtom)

  const handleBackToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // 常驻元素 + class 切换：用 CSS transition 实现显隐动画
  return (
    <div className="fixed right-4 bottom-6 z-10">
      <button
        className={clsx(
          'size-10 rounded-full shadow-lg shadow-zinc-800/5 border border-primary bg-white/50 dark:bg-zinc-800/50 backdrop-blur transition-[opacity,transform] duration-300',
          isShow ? 'opacity-100 scale-100' : 'opacity-0 scale-0 pointer-events-none'
        )}
        type="button"
        aria-label="Back to top"
        onClick={handleBackToTop}
      >
        <i className="iconfont icon-rocket"></i>
      </button>
    </div>
  )
}
