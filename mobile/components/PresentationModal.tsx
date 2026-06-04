import type { ReactNode } from 'react'
import { Modal, type ModalProps } from 'react-native'

/** Native modal transitions (slide / fade) — matches original location sheets. */
export function PresentationModal({
  visible,
  onClose,
  children,
  animationType = 'slide',
  transparent = false,
}: {
  visible: boolean
  onClose: () => void
  children: ReactNode
  animationType?: ModalProps['animationType']
  transparent?: boolean
}) {
  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent={transparent}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {children}
    </Modal>
  )
}
