import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { buildLocationMapHtml } from '@/lib/locationMapHtml'
import type { LocationMapViewProps } from '@/lib/locationMapTypes'

/** Web: OpenStreetMap in WebView (same as Android). */
export function LocationMapView({
  latitude,
  longitude,
  width,
  height,
  fill,
  interactive = true,
  onRegionChangeComplete,
  initialRegion,
}: LocationMapViewProps) {
  const lat = initialRegion?.latitude ?? latitude
  const lon = initialRegion?.longitude ?? longitude

  const mode = onRegionChangeComplete
    ? 'picker'
    : interactive
      ? 'interactive'
      : 'static'

  const html = useMemo(() => buildLocationMapHtml(lat, lon, mode), [lat, lon, mode])

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (!onRegionChangeComplete) return
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string
          lat?: number
          lng?: number
        }
        if (
          data.type === 'center' &&
          typeof data.lat === 'number' &&
          typeof data.lng === 'number'
        ) {
          onRegionChangeComplete({
            latitude: data.lat,
            longitude: data.lng,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          })
        }
      } catch {
        // ignore
      }
    },
    [onRegionChangeComplete],
  )

  return (
    <View
      style={[
        styles.wrap,
        fill ? styles.fill : { width: width ?? '100%', height: height ?? 200 },
      ]}
    >
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={mode !== 'static'}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        pointerEvents={mode === 'static' ? 'none' : 'auto'}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        setSupportMultipleWindows={false}
        onMessage={mode === 'picker' ? onMessage : undefined}
      />
    </View>
  )
}

export { regionFor } from '@/lib/locationMapTypes'

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e8ecef',
  },
  fill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
