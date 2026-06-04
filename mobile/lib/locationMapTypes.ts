import type { RefObject } from 'react'

export type MapCoordinate = {
  latitude: number
  longitude: number
}

export type MapRegion = MapCoordinate & {
  latitudeDelta: number
  longitudeDelta: number
}

export type LocationMapViewProps = {
  latitude: number
  longitude: number
  width?: number | `${number}%`
  height?: number | `${number}%`
  fill?: boolean
  interactive?: boolean
  showUserLocation?: boolean
  showMarker?: boolean
  onRegionChangeComplete?: (region: MapRegion) => void
  initialRegion?: MapRegion
  mapRef?: RefObject<unknown>
}

export const DEFAULT_MAP_DELTA = 0.012

export function regionFor(
  latitude: number,
  longitude: number,
  delta = DEFAULT_MAP_DELTA,
): MapRegion {
  return {
    latitude,
    longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  }
}
