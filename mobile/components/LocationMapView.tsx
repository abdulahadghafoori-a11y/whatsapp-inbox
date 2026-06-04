import { Platform } from 'react-native'
import { LocationMapView as LocationMapViewAndroid } from '@/components/LocationMapView.android'
import { LocationMapView as LocationMapViewIos } from '@/components/LocationMapView.ios'

/** iOS → Apple Maps (MapKit). Android → OSM WebView (no Google API key). */
export const LocationMapView =
  Platform.OS === 'ios' ? LocationMapViewIos : LocationMapViewAndroid

export { regionFor } from '@/lib/locationMapTypes'
export type { LocationMapViewProps, MapRegion } from '@/lib/locationMapTypes'
