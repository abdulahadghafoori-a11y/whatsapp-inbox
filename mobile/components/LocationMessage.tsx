import { useState } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { useColorScheme } from 'nativewind'
import { MessageSendingOverlay } from '@/components/MessageSendingOverlay'
import { LocationDetailSheet } from '@/components/LocationDetailSheet'
import { LocationMapView } from '@/components/LocationMapView'
import { locationDisplayLabel } from '@/lib/locationDisplayLabel'
import { parseMessageLocation } from '@/lib/messageLocation'
import type { Message } from '@/types'

const MAP_W = 268
const MAP_H = 150

export function LocationMessage({ message }: { message: Message }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const loc = parseMessageLocation(message.metadata)

  if (!loc) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableText}>Location unavailable</Text>
      </View>
    )
  }

  const label = locationDisplayLabel(loc)
  const sending =
    message.direction === 'outbound' && message.status === 'pending'

  return (
    <>
      <Pressable
        onPress={() => setDetailOpen(true)}
        style={[styles.card, isDark && { backgroundColor: '#233138' }]}
        accessibilityRole="button"
        accessibilityLabel="View location on map"
      >
        <View style={styles.mapClip}>
          {sending ? <MessageSendingOverlay label="Sending…" /> : null}
          <LocationMapView
            latitude={loc.latitude}
            longitude={loc.longitude}
            width={MAP_W}
            height={MAP_H}
            interactive={false}
            showMarker
          />
        </View>
        <View style={[styles.footer, isDark && { borderTopColor: 'rgba(255,255,255,0.08)' }]}>
          <Text numberOfLines={2} style={[styles.title, isDark && { color: '#e5e5e5' }]}>
            {label}
          </Text>
          <Text style={[styles.hint, isDark && { color: '#8a9aa1' }]}>Tap to view on map</Text>
        </View>
      </Pressable>

      <LocationDetailSheet
        location={loc}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    width: MAP_W,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  mapClip: {
    width: MAP_W,
    height: MAP_H,
    overflow: 'hidden',
    position: 'relative',
  },
  unavailable: {
    minWidth: 220,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  unavailableText: {
    fontSize: 14,
    color: '#737373',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171717',
  },
  hint: {
    marginTop: 2,
    fontSize: 11,
    color: '#a3a3a3',
  },
})
