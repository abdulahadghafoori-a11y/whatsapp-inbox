import type { ComponentType } from 'react'
import { Platform } from 'react-native'
import type { LocationMapViewProps } from '@/lib/locationMapTypes'

export type { LocationMapViewProps }
export { regionFor } from '@/lib/locationMapTypes'

// TypeScript entry; Metro still resolves platform files when imported directly.
const impl =
  Platform.OS === 'web'
    ? require('./LocationMapView.web')
    : Platform.OS === 'ios'
      ? require('./LocationMapView.ios')
      : require('./LocationMapView.android')

export const LocationMapView = impl.LocationMapView as ComponentType<LocationMapViewProps>
