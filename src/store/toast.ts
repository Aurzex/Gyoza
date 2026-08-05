import { atom, createStore } from 'jotai'

export type ToastItem = {
  id: number
  message: string
}

export const toastsAtom = atom<ToastItem[]>([])

/** 独立 store：允许在 React 组件外命令式触发 toast */
export const toastStore = createStore()

let toastId = 0

export function toast(message: string, duration = 3000) {
  const id = ++toastId
  toastStore.set(toastsAtom, (prev) => [...prev, { id, message }])
  setTimeout(() => {
    toastStore.set(toastsAtom, (prev) => prev.filter((item) => item.id !== id))
  }, duration)
}
