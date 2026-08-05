import { useAtomValue } from 'jotai'
import { Modal } from './Modal'
import { modalStackAtom } from '@/store/modalStack'

export function ModalStack() {
  const modalStack = useAtomValue(modalStackAtom)

  return (
    <>
      {modalStack.map((modal, index) => (
        <Modal key={modal.id} index={index} id={modal.id}>
          {modal.content}
        </Modal>
      ))}
    </>
  )
}
