import { menus } from '@/config.json'
import { createContext, useContext, forwardRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'

export function HeaderDrawer({ zIndex = 999 }: { zIndex?: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const overlayZIndex = zIndex - 1
  const contentZIndex = zIndex

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <TriggerButton />
      </Dialog.Trigger>

      <Dialog.Portal forceMount>
        <Dialog.Overlay asChild>
          <div
            className={clsx(
              'fixed inset-0 bg-gray-800/40 transition-opacity duration-200',
              isOpen ? 'opacity-100' : 'opacity-0'
            )}
            style={{ zIndex: overlayZIndex }}
          />
        </Dialog.Overlay>

        <Dialog.Content asChild>
          <div
            className={clsx(
              'fixed left-0 inset-y-0 h-full bg-primary rounded-r-lg p-4 flex flex-col justify-center w-[260px] max-w-[80%] transition-transform duration-200',
              isOpen ? 'translate-x-0' : '-translate-x-full'
            )}
            style={{ zIndex: contentZIndex }}
          >
            <DrawerContext.Provider
              value={{
                dismiss() {
                  setIsOpen(false)
                },
              }}
            >
              <DrawerContentImpl isOpen={isOpen} />
            </DrawerContext.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const TriggerButton = forwardRef<HTMLButtonElement>((props, ref) => {
  return (
    <button
      ref={ref}
      className="size-9 rounded-full shadow-lg shadow-zinc-800/5 border border-primary bg-white/50 dark:bg-zinc-800/50 backdrop-blur"
      type="button"
      aria-label="Open menu"
      {...props}
    >
      <i className="iconfont icon-menu"></i>
    </button>
  )
})

function DrawerContentImpl({ isOpen }: { isOpen: boolean }) {
  const { dismiss } = useContext(DrawerContext)

  return (
    <ul className="mt-8 pb-8 overflow-y-auto overflow-x-hidden min-h-0">
      {menus.map((menu, index) => (
        <li
          key={menu.name}
          className={clsx(
            'transition-all duration-300',
            isOpen ? 'opacity-100 translate-x-0 visible' : 'opacity-0 -translate-x-full invisible'
          )}
          style={{ transitionDelay: isOpen ? `${0.1 + index * 0.05}s` : '0s' }}
        >
          <a className="inline-flex p-2 space-x-4" href={menu.link} onClick={dismiss}>
            <i className={clsx('iconfont', menu.icon)}></i>
            <span>{menu.name}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

const DrawerContext = createContext<{ dismiss(): void }>(null!)
