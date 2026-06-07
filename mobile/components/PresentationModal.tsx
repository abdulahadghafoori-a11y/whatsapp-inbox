import type { ReactNode } from 'react'
import { Modal, StyleSheet, type ModalProps } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

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
      {/* RNGH gestures do not work inside Android Modal without a nested root. */}
      <GestureHandlerRootView style={styles.root}>{children}</GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
