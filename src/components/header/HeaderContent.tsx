import { useRef } from 'react'
import { menus } from '@/config.json'
import { clsx } from 'clsx'
import {
  usePathName,
  useShouldAccessibleMenuShow,
  useShouldHeaderMenuBgShow,
  useShouldHeaderMetaShow,
} from './hooks'
import { RootPortal } from '@/components/RootPortal'

export function HeaderContent() {
  return (
    <>
      <AnimatedMenu />
      <AccessibleMenu />
    </>
  )
}

function AnimatedMenu() {
  const shouldHeaderMetaShow = useShouldHeaderMetaShow()
  const shouldBgShow = useShouldHeaderMenuBgShow()

  // 常驻 + CSS transition 显隐，替代 AnimatePresence；
  // 隐藏时禁止指针交互与键盘聚焦
  return (
    <div
      className={clsx(
        'transition-opacity duration-200',
        shouldHeaderMetaShow ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 visible'
      )}
    >
      <HeaderMenu isBgShow={shouldBgShow} />
    </div>
  )
}

function AccessibleMenu() {
  const shouldShow = useShouldAccessibleMenuShow()

  // 条件渲染：SSR 初始为 false（与客户端水合一致），滚动后挂载到 body
  if (!shouldShow) return null

  return (
    <RootPortal>
      <div className="accessible-menu-in fixed z-10 top-12 inset-x-0 flex justify-center pointer-events-none">
        <HeaderMenu isBgShow />
      </div>
    </RootPortal>
  )
}

function HeaderMenu({ isBgShow }: { isBgShow: boolean }) {
  const pathName = usePathName()
  const navRef = useRef<HTMLElement>(null)

  // 命令式 DOM 更新：鼠标坐标/半径直接写入 CSS 变量，避免每帧 setState 重渲染
  const handleMouseMove = (event: React.MouseEvent) => {
    const $nav = navRef.current
    if (!$nav) return
    const bounds = $nav.getBoundingClientRect()
    $nav.style.setProperty('--menu-mouse-x', `${event.clientX - bounds.left}px`)
    $nav.style.setProperty('--menu-mouse-y', `${event.clientY - bounds.top}px`)
    $nav.style.setProperty(
      '--menu-radius',
      `${Math.sqrt(bounds.width ** 2 + bounds.height ** 2) / 2.5}px`
    )
  }

  return (
    <nav
      ref={navRef}
      className={clsx('relative rounded-full group pointer-events-auto duration-200', {
        'bg-gradient-to-b from-zinc-50/70 to-white/90 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur-md dark:from-zinc-900/70 dark:to-zinc-800/90 dark:ring-zinc-100/10':
          isBgShow,
      })}
      onMouseMove={handleMouseMove}
    >
      <div
        className="absolute -z-1 -inset-px rounded-full opacity-0 group-hover:opacity-100 duration-500"
        style={{
          background:
            'radial-gradient(var(--menu-radius, 0px) circle at var(--menu-mouse-x, 0px) var(--menu-mouse-y, 0px), rgb(var(--color-accent) / 0.12) 0%, transparent 65%)',
        }}
        aria-hidden
      ></div>
      <div className="text-sm px-4 flex">
        {menus.map((menu) => (
          <HeaderMenuItem
            key={menu.name}
            href={menu.link}
            title={menu.name}
            icon={menu.icon}
            isActive={pathName === menu.link}
          />
        ))}
      </div>
    </nav>
  )
}

function HeaderMenuItem({
  href,
  isActive,
  title,
  icon,
}: {
  href: string
  isActive: boolean
  title: string
  icon: string
}) {
  return (
    <a
      className={clsx(
        'link-underline relative block px-4 py-1.5',
        isActive ? 'text-accent' : 'hover:text-accent'
      )}
      href={href}
    >
      <div className="flex space-x-2">
        {isActive && <i className={clsx('iconfont menu-icon-in', icon)}></i>}
        <span>{title}</span>
      </div>
      {isActive && (
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"></div>
      )}
    </a>
  )
}
