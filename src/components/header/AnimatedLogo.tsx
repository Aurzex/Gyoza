import { useShouldHeaderMetaShow, useIsMobile } from './hooks'
import { author } from '@/config.json'
import clsx from 'clsx'

export function AnimatedLogo() {
  const isMobile = useIsMobile()
  const shouldHeaderMetaShow = useShouldHeaderMetaShow()

  // 移动端：meta 显示时 logo 淡出（常驻 + CSS transition）
  if (!isMobile) {
    return <Logo />
  }

  return (
    <div
      className={clsx(
        'transition-opacity duration-200',
        shouldHeaderMetaShow ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      <Logo />
    </div>
  )
}

function Logo() {
  return (
    <a className="block" href="/" title="Nav to home">
      <img
        className="size-[40px] select-none object-cover rounded-2xl"
        src={author.avatar}
        alt="Site owner avatar"
      />
    </a>
  )
}
