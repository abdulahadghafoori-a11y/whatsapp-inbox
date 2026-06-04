import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

/** Prominent optimistic send/upload indicator over media bubbles. */
export function MessageSendingOverlay({
  label = 'Sending…',
}: {
  label?: string
}) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.chip}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 12,
  },
  chip: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    minWidth: 140,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
})
