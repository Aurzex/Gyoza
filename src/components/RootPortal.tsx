import { createPortal } from 'react-dom'

export function RootPortal({ to, children }: { to?: HTMLElement; children: React.ReactNode }) {
  // SSR 阶段无 document：直接内联渲染占位（调用方保证 SSR 时内容为空）
  if (typeof document === 'undefined') {
    return <>{children}</>
  }
  return createPortal(children, to ?? document.body)
}
