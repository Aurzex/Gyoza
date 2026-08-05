import { getLocalTheme } from '@/utils/theme'
import { atom } from 'jotai'

export type Theme = 'light' | 'dark' | 'system'

/**
 * SSR 安全：服务端渲染阶段无 window/localStorage，统一按 'system'
 * 渲染（真实主题由 ThemeLoader 在 head 内联脚本先行应用，避免水合不匹配）。
 */
export const themeAtom = atom<Theme>(typeof window === 'undefined' ? 'system' : getLocalTheme())
