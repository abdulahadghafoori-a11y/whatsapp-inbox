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
  const hasAddress = !!(loc.address?.trim() || loc.name?.trim())
  const sending =
    message.direction === 'outbound' && message.status === 'pending'

  return (
    <>
      <Pressable
        onPress={() => setDetailOpen(true)}
        style={styles.card}
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
        {hasAddress ? (
          <Text
            numberOfLines={2}
            style={[styles.address, isDark && styles.addressDark]}
          >
            {label}
          </Text>
        ) : null}
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
    borderRadius: 10,
  },
  mapClip: {
    width: MAP_W,
    height: MAP_H,
    overflow: 'hidden',
    position: 'relative',
  },
  address: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    fontSize: 14,
    lineHeight: 19,
    color: '#111b21',
  },
  addressDark: {
    color: '#e9edef',
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
})
