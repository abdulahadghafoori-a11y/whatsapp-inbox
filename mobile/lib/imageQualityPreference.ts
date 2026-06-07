import { appStorage } from '@/lib/appStorage'

export type MediaQualityTier = 'standard' | 'hd'
/** @deprecated Use MediaQualityTier */
export type ImageQualityTier = MediaQualityTier

const IMAGE_KEY = 'image-quality-default'
const VIDEO_KEY = 'video-quality-default'

export async function getDefaultImageQuality(): Promise<MediaQualityTier> {
  const raw = await appStorage.getItem(IMAGE_KEY)
  if (raw === 'standard') return 'standard'
  return 'hd'
}

export async function setDefaultImageQuality(tier: MediaQualityTier): Promise<void> {
  await appStorage.setItem(IMAGE_KEY, tier)
}

export async function getDefaultVideoQuality(): Promise<MediaQualityTier> {
  const raw = await appStorage.getItem(VIDEO_KEY)
  if (raw === 'standard') return 'standard'
  return 'hd'
}

export async function setDefaultVideoQuality(tier: MediaQualityTier): Promise<void> {
  await appStorage.setItem(VIDEO_KEY, tier)
}
