import { themeAtom } from '@/store/theme'
import { useAtom } from 'jotai'
import { useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { getLocalTheme } from '@/utils/theme'

type Theme = 'light' | 'dark' | 'system'

export function ThemeSwitch() {
  const [theme, setTheme] = useAtom(themeAtom)

  // SSR 首帧渲染 'system' 以保证水合一致；挂载后立即从 localStorage
  // 读取真实主题修正滑块位置（页面主题色已由 ThemeLoader 先行应用，无闪烁）
  useLayoutEffect(() => {
    setTheme(getLocalTheme())
  }, [setTheme])

  const left = { light: 4, system: 36, dark: 68 }[theme]

  /**
   * 主题切换动画：View Transitions API + clip-path 圆形扩散
   * （背景色从点击按钮的位置平铺开）。
   * - flushSync 让主题在快照捕获前同步提交，新快照即新主题
   * - 不支持 View Transitions 的浏览器直接切换（渐进增强）
   */
  const handleThemeChange = (next: Theme) => (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const maxRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

    const root = document.documentElement
    root.style.setProperty('--theme-origin-x', `${x}px`)
    root.style.setProperty('--theme-origin-y', `${y}px`)
    root.style.setProperty('--theme-max-radius', `${maxRadius}px`)

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => void
    }

    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => {
        flushSync(() => setTheme(next))
      })
    } else {
      setTheme(next)
    }
  }

  return (
    <div className="relative inline-block">
      <div
        className="absolute -z-1 top-1 size-[32px] rounded-full bg-primary transition-transform shadow"
        style={{
          transform: `translateX(${left}px)`,
        }}
      ></div>
      <div className="p-[3px] flex rounded-full border border-primary" role="radiogroup">
        <button
          className="size-[32px] flex items-center justify-center"
          type="button"
          aria-label="Switch to light theme"
          onClick={handleThemeChange('light')}
        >
          <i className="iconfont icon-sun"></i>
        </button>
        <button
          className="size-[32px] flex items-center justify-center"
          type="button"
          aria-label="Switch to system theme"
          onClick={handleThemeChange('system')}
        >
          <i className="iconfont icon-computer"></i>
        </button>
        <button
          className="size-[32px] flex items-center justify-center"
          type="button"
          aria-label="Switch to dark theme"
          onClick={handleThemeChange('dark')}
        >
          <i className="iconfont icon-moon"></i>
        </button>
      </div>
    </div>
  )
}
