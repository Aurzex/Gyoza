import { atom } from 'jotai'

/**
 * 滚动状态设计（性能）：
 * 连续的滚动位置是高频变化值，若存入 jotai 会让所有订阅组件在滚动时
 * 每帧重渲染。因此这里只存"离散状态"——由 PageScrollInfoProvider 在
 * 跨越阈值时才更新，订阅方仅在状态翻转时收到通知。
 */
export const pageScrollDirectionAtom = atom<'up' | 'down' | null>(null)

/** 滚动位置 >= 60px：header 进入"滚动态"（菜单背景隐藏 / 元信息显示） */
export const isHeaderScrolledAtom = atom(false)

/** 滚动位置 >= 400px：可折叠菜单可出现的区域 */
export const isAccessibleMenuScrolledAtom = atom(false)

/** 滚动位置 > 100px：显示返回顶部按钮 */
export const isBackToTopVisibleAtom = atom(false)
