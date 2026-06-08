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
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
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
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [booting, setBooting] = useState(true)
  const [initialRegion, setInitialRegion] = useState<Region | null>(null)
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(
    null,
  )
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendingCurrentRef = useRef(false)

  useEffect(() => {
    if (!sending) sendingCurrentRef.current = false
  }, [sending])

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

        const lastKnown = await ExpoLocation.getLastKnownPositionAsync()
        if (!cancelled && lastKnown) {
          const { latitude, longitude } = lastKnown.coords
          const region = regionFor(latitude, longitude)
          setGps({ latitude, longitude })
          setInitialRegion(region)
          setCenter({ latitude, longitude })
          setBooting(false)
          void refreshAddress(latitude, longitude)
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
    if (booting || sending || sendingCurrentRef.current) return
    sendingCurrentRef.current = true
    try {
      const coords = gps
        ? gps
        : (await ExpoLocation.getCurrentPositionAsync({
            accuracy: ExpoLocation.Accuracy.High,
          })).coords
      const { latitude, longitude } = coords
      const label = await reverseGeocodeLabel(latitude, longitude)
      onSend({
        latitude,
        longitude,
        address: label ?? undefined,
        ...(!label ? { name: 'Current location' } : {}),
      })
    } catch {
      sendingCurrentRef.current = false
    }
  }

  function handleSendPinned() {
    if (!center || sending) return
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
      <SafeAreaView style={[styles.root, isDark && { backgroundColor: '#0b141a' }]} edges={['top', 'bottom']}>
        <View style={styles.mapShell}>
          {initialRegion ? (
            <LocationMapView
              latitude={initialRegion.latitude}
              longitude={initialRegion.longitude}
              fill
              showMarker={false}
              showUserLocation
              userLatitude={gps?.latitude ?? null}
              userLongitude={gps?.longitude ?? null}
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
            <View style={[styles.loadingOverlay, isDark && { backgroundColor: 'rgba(11,20,26,0.85)' }]}>
              <ActivityIndicator color="#00A884" size="large" />
              <Text style={[styles.loadingText, isDark && { color: '#a3b0b6' }]}>Getting your location…</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.footer, isDark && { backgroundColor: '#171717', borderTopColor: '#233138' }]}>
          <Text style={[styles.footerTitle, isDark && { color: '#f5f5f5' }]}>Send location</Text>

          <View style={styles.addressBox}>
            {geocoding ? (
              <ActivityIndicator color="#00A884" size="small" />
            ) : (
              <Text numberOfLines={2} style={[styles.addressText, isDark && { color: '#d4d4d4' }]}>
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
            style={[styles.currentBtn, isDark && { backgroundColor: '#233138' }]}
          >
            <Ionicons name="navigate" size={18} color="#00A884" />
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

          <Pressable onPress={onCancel} disabled={sending} style={[styles.cancelBtn, isDark && { backgroundColor: '#233138' }]}>
            <Text style={[styles.cancelBtnText, isDark && { color: '#d4d4d4' }]}>Cancel</Text>
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
    backgroundColor: '#00A884',
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
    backgroundColor: '#00A884',
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
  currentBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#00A884',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#00A884',
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
