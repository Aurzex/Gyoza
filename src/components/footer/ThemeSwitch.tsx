import { themeAtom } from '@/store/theme'
import { useAtom } from 'jotai'
import { useLayoutEffect } from 'react'
import { getLocalTheme } from '@/utils/theme'

export function ThemeSwitch() {
  const [theme, setTheme] = useAtom(themeAtom)

  // SSR 首帧渲染 'system' 以保证水合一致；挂载后立即从 localStorage
  // 读取真实主题修正滑块位置（页面主题色已由 ThemeLoader 先行应用，无闪烁）
  useLayoutEffect(() => {
    setTheme(getLocalTheme())
  }, [setTheme])

  const left = { light: 4, system: 36, dark: 68 }[theme]

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
          onClick={() => setTheme('light')}
        >
          <i className="iconfont icon-sun"></i>
        </button>
        <button
          className="size-[32px] flex items-center justify-center"
          type="button"
          aria-label="Switch to system theme"
          onClick={() => setTheme('system')}
        >
          <i className="iconfont icon-computer"></i>
        </button>
        <button
          className="size-[32px] flex items-center justify-center"
          type="button"
          aria-label="Switch to dark theme"
          onClick={() => setTheme('dark')}
        >
          <i className="iconfont icon-moon"></i>
        </button>
      </div>
    </div>
  )
}
