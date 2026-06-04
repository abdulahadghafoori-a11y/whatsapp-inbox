import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import type { Region } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ExpoLocation from 'expo-location'
import { SendIcon } from '@/components/ChatIcons'
import { LocationMapView, regionFor } from '@/components/LocationMapView'
import { PresentationModal } from '@/components/PresentationModal'
import { locationDisplayLabel } from '@/lib/locationDisplayLabel'
import { reverseGeocodeLabel, type MessageLocation } from '@/lib/messageLocation'

export type PendingLocation = { loading: true } | null

/** Full-screen interactive map picker (pan/zoom + center pin), WA-style. */
export function LocationPickerSheet({
  open,
  sending,
  onCancel,
  onSend,
  onPermissionDenied,
}: {
  open: boolean
  sending?: boolean
  onCancel: () => void
  onSend: (location: MessageLocation & { name?: string }) => void
  onPermissionDenied?: () => void
}) {
  const [booting, setBooting] = useState(true)
  const [initialRegion, setInitialRegion] = useState<Region | null>(null)
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(
    null,
  )
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshAddress = useCallback(async (latitude: number, longitude: number) => {
    setGeocoding(true)
    const label = await reverseGeocodeLabel(latitude, longitude)
    setAddress(label)
    setGeocoding(false)
  }, [])

  const scheduleGeocode = useCallback(
    (latitude: number, longitude: number) => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
      geocodeTimer.current = setTimeout(() => {
        void refreshAddress(latitude, longitude)
      }, 450)
    },
    [refreshAddress],
  )

  useEffect(() => {
    if (!open) {
      setBooting(true)
      setInitialRegion(null)
      setCenter(null)
      setGps(null)
      setAddress(null)
      return
    }

    let cancelled = false

    async function boot() {
      setBooting(true)
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          onPermissionDenied?.()
          onCancel()
          return
        }
        const pos = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        })
        if (cancelled) return
        const { latitude, longitude } = pos.coords
        const region = regionFor(latitude, longitude)
        setGps({ latitude, longitude })
        setInitialRegion(region)
        setCenter({ latitude, longitude })
        setBooting(false)
        void refreshAddress(latitude, longitude)
      } catch {
        if (!cancelled) onCancel()
      }
    }

    void boot()
    return () => {
      cancelled = true
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    }
  }, [open, onCancel, onPermissionDenied, refreshAddress])

  const onRegionChangeComplete = useCallback(
    (region: Region) => {
      setCenter({ latitude: region.latitude, longitude: region.longitude })
      scheduleGeocode(region.latitude, region.longitude)
    },
    [scheduleGeocode],
  )

  async function handleSendCurrent() {
    if (booting || sending) return
    try {
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      })
      const { latitude, longitude } = pos.coords
      const label = await reverseGeocodeLabel(latitude, longitude)
      onSend({
        latitude,
        longitude,
        address: label ?? undefined,
        ...(!label ? { name: 'Current location' } : {}),
      })
    } catch {
      // GPS unavailable
    }
  }

  function handleSendPinned() {
    if (!center) return
    onSend({
      latitude: center.latitude,
      longitude: center.longitude,
      address: address ?? undefined,
    })
  }

  const footerLabel = center
    ? locationDisplayLabel({
        latitude: center.latitude,
        longitude: center.longitude,
        address,
      })
    : null

  if (!open) return null

  return (
    <PresentationModal visible={open} onClose={onCancel} animationType="slide">
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.mapShell}>
          {initialRegion ? (
            <LocationMapView
              latitude={initialRegion.latitude}
              longitude={initialRegion.longitude}
              fill
              showMarker={false}
              showUserLocation
              interactive
              initialRegion={initialRegion}
              onRegionChangeComplete={onRegionChangeComplete}
            />
          ) : null}

          <View pointerEvents="none" style={styles.centerPin}>
            <View style={styles.pinHead} />
            <View style={styles.pinStem} />
          </View>

          {booting ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#128C7E" size="large" />
              <Text style={styles.loadingText}>Getting your location…</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Send location</Text>

          <View style={styles.addressBox}>
            {geocoding ? (
              <ActivityIndicator color="#128C7E" size="small" />
            ) : (
              <Text numberOfLines={2} style={styles.addressText}>
                {footerLabel ??
                  (center
                    ? `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}`
                    : 'Move the map to choose a location')}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => void handleSendCurrent()}
            disabled={booting || sending}
            style={styles.currentBtn}
          >
            <Text style={styles.currentBtnIcon}>📍</Text>
            <Text style={styles.currentBtnText}>Send your current location</Text>
          </Pressable>

          <Pressable
            onPress={handleSendPinned}
            disabled={booting || sending || !center}
            style={[styles.sendBtn, (booting || !center) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <SendIcon />
                <Text style={styles.sendBtnText}>Send this location</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={onCancel} disabled={sending} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
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
  mapShell: {
    flex: 1,
    backgroundColor: '#e8ecef',
  },
  centerPin: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHead: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#128C7E',
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinStem: {
    width: 3,
    height: 10,
    backgroundColor: '#128C7E',
    borderRadius: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#525252',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  footerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 2,
  },
  addressBox: {
    minHeight: 40,
    justifyContent: 'center',
  },
  addressText: {
    fontSize: 14,
    color: '#404040',
    lineHeight: 20,
  },
  currentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f0f2f5',
  },
  currentBtnIcon: {
    fontSize: 20,
  },
  currentBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#128C7E',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#128C7E',
    paddingVertical: 14,
  },
  sendBtnDisabled: {
    backgroundColor: '#a8d5cf',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelBtn: {
    borderRadius: 12,
    backgroundColor: '#f0f2f5',
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#404040',
  },
})
