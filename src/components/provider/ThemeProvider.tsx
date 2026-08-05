import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'
import { getSystemTheme, changePageTheme, setLocalTheme } from '@/utils/theme'
import { themeAtom } from '@/store/theme'

export function ThemeProvider() {
  const theme = useAtomValue(themeAtom)
  const isFirstRun = useRef(true)

  // 主题应用：跳过首次运行——初始主题已由 ThemeLoader（head 内联脚本）
  // 应用，避免把用户本地主题覆盖回默认值造成闪烁
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    setLocalTheme(theme)
    changePageTheme(theme === 'system' ? getSystemTheme() : theme)
  }, [theme])

  // 跟随系统主题切换
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const handlePrefersColorSchemeChange = (event: MediaQueryListEvent) => {
      if (theme === 'system') {
        changePageTheme(event.matches ? 'dark' : 'light')
      }
    }
    query.addEventListener('change', handlePrefersColorSchemeChange)
    return () => {
      query.removeEventListener('change', handlePrefersColorSchemeChange)
    }
  }, [theme])

  return null
}
