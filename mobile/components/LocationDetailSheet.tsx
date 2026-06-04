import { Pressable, Text, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LocationMapView } from '@/components/LocationMapView'
import { PresentationModal } from '@/components/PresentationModal'
import { locationDisplayLabel } from '@/lib/locationDisplayLabel'
import type { MessageLocation } from '@/lib/messageLocation'
import { showOpenInMapsPicker } from '@/lib/openExternalMaps'

export function LocationDetailSheet({
  location,
  visible,
  onClose,
}: {
  location: MessageLocation | null
  visible: boolean
  onClose: () => void
}) {
  if (!location) return null

  const label = locationDisplayLabel(location)

  return (
    <PresentationModal visible={visible} onClose={onClose} animationType="slide">
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.mapWrap}>
          <LocationMapView
            latitude={location.latitude}
            longitude={location.longitude}
            fill
            interactive
            showMarker
          />
        </View>

        <View style={styles.footer}>
          <Text numberOfLines={2} style={styles.label}>
            {label}
          </Text>

          <Pressable
            onPress={() =>
              void showOpenInMapsPicker(location.latitude, location.longitude, label)
            }
            style={styles.openBtn}
          >
            <Text style={styles.openBtnText}>Open in maps app</Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </PresentationModal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapWrap: {
    flex: 1,
    backgroundColor: '#e8ecef',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: '#171717',
    lineHeight: 21,
  },
  openBtn: {
    borderRadius: 12,
    backgroundColor: '#128C7E',
    paddingVertical: 14,
    alignItems: 'center',
  },
  openBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    borderRadius: 12,
    backgroundColor: '#f0f2f5',
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#404040',
  },
})
