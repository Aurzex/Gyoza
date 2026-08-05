import { site } from '@/config.json'
import { useHeaderMetaInfo, useShouldHeaderMetaShow } from './hooks'
import clsx from 'clsx'

export function HeaderMeta() {
  const { title, description, slug } = useHeaderMetaInfo()
  const shouldShow = useShouldHeaderMetaShow()

  // 常驻元素 + class 切换（CSS transition），替代 AnimatePresence
  return (
    <div
      className={clsx(
        'absolute inset-0 z-1 flex items-center justify-between md:px-10 transition-all duration-300',
        shouldShow ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'
      )}
    >
      <div className="grow min-w-0">
        <div className="text-secondary text-xs truncate">{description}</div>
        <h2 className="truncate text-lg">{title}</h2>
      </div>
      <div className="hidden md:block min-w-0 text-right">
        <div className="text-secondary text-xs truncate">{slug}</div>
        <div>{site.title}</div>
      </div>
    </div>
  )
}
