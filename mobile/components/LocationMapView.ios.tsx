import type { RefObject } from 'react'
import { StyleSheet } from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'
import type { LocationMapViewProps } from '@/lib/locationMapTypes'
import { regionFor as regionForCoord } from '@/lib/locationMapTypes'

/**
 * iOS: Apple Maps (MapKit) via react-native-maps default provider — no API key.
 */
export function LocationMapView({
  latitude,
  longitude,
  width,
  height,
  fill,
  interactive = true,
  showUserLocation = false,
  showMarker = true,
  onRegionChangeComplete,
  initialRegion,
  mapRef,
}: LocationMapViewProps) {
  const mapStyle = fill
    ? locationMapStyles.fill
    : { width: width ?? '100%', height: height ?? 200 }

  const region: Region = initialRegion ?? regionForCoord(latitude, longitude)

  return (
    <MapView
      ref={mapRef as RefObject<MapView> | undefined}
      style={mapStyle}
      initialRegion={region}
      onRegionChangeComplete={onRegionChangeComplete}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      zoomTapEnabled={interactive}
      zoomControlEnabled={false}
      showsUserLocation={showUserLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      showsScale={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {showMarker ? (
        <Marker coordinate={{ latitude, longitude }} pinColor="#128C7E" />
      ) : null}
    </MapView>
  )
}

export { regionFor } from '@/lib/locationMapTypes'

const locationMapStyles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
})
