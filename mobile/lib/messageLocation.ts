import * as ExpoLocation from 'expo-location'
import { dedupeAddressParts } from '@/lib/locationDisplayLabel'

export type MessageLocation = {
  latitude: number
  longitude: number
  name?: string | null
  address?: string | null
}

export function parseMessageLocation(metadata: unknown): MessageLocation | null {
  if (!metadata || typeof metadata !== 'object') return null
  const m = metadata as Record<string, unknown>
  const loc =
    m.location && typeof m.location === 'object'
      ? (m.location as Record<string, unknown>)
      : m
  const latitude = Number(loc.latitude)
  const longitude = Number(loc.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    latitude,
    longitude,
    name: typeof loc.name === 'string' ? loc.name : null,
    address: typeof loc.address === 'string' ? loc.address : null,
  }
}

export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}

/** Static map image centered on coordinates (OpenStreetMap via Wikimedia Maps). */
export function staticMapImageUrl(
  latitude: number,
  longitude: number,
  width = 280,
  height = 160,
): string {
  const zoom = 15
  const w = Math.round(Math.min(640, Math.max(120, width)))
  const h = Math.round(Math.min(400, Math.max(80, height)))
  const scale = w >= 320 ? '@2x' : ''
  return `https://maps.wikimedia.org/img/osm-intl,${zoom},${latitude},${longitude},${w}x${h}${scale}.png`
}

export async function reverseGeocodeLabel(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const rows = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude })
    const p = rows[0]
    if (!p) return null
    const parts = dedupeAddressParts(
      [p.name, p.street, p.district, p.city, p.region, p.postalCode, p.country].filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      ),
    )
    return parts.length > 0 ? parts.join(', ') : null
  } catch {
    return null
  }
}
