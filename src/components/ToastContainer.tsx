import { toastsAtom, toastStore } from '@/store/toast'
import { useAtomValue } from 'jotai'

export function ToastContainer() {
  // 必须从 toastStore 读取：toast() 在组件外通过该 store 写入
  const toasts = useAtomValue(toastsAtom, { store: toastStore })

  return (
    <div className="fixed bottom-6 right-4 z-[1200] flex flex-col gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          className="toast-in bg-primary text-primary text-sm border border-primary rounded-lg px-4 py-2 shadow-lg shadow-zinc-800/5 flex items-center"
          role="status"
        >
          <i className="iconfont icon-check text-accent mr-2"></i>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  )
}
