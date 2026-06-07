import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'react-native'
import type { ImageQualityTier } from '@/lib/imageQualityPreference'

export const WA_PHOTO_MAX_EDGE = 1600
export const WA_PHOTO_HD_MAX_EDGE = 4096
/** WhatsApp shows HD on recipients when long edge is high enough (no API flag). */
export const WA_PHOTO_HD_MIN_EDGE = 2048
export const WA_IMAGE_MAX_BYTES = 5 * 1024 * 1024

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject)
  })
}

async function encodeJpeg(
  uri: string,
  maxEdge: number,
  compress: number,
): Promise<{ uri: string; width: number; height: number }> {
  const { width, height } = await imageSize(uri)
  const long = Math.max(width, height)
  const actions: ImageManipulator.Action[] =
    long > maxEdge
      ? [
          {
            resize: {
              width: Math.round(width * (maxEdge / long)),
              height: Math.round(height * (maxEdge / long)),
            },
          },
        ]
      : []

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  return { uri: result.uri, width: result.width, height: result.height }
}

async function fileBytes(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri)
  if (!info.exists || !('size' in info) || typeof info.size !== 'number') return 0
  return info.size
}

/**
 * WA-like client prep: resize long edge + JPEG encode before upload.
 * Server only validates — no Sharp on the backend for images.
 */
export async function prepareImageForSend(
  uri: string,
  quality: ImageQualityTier = 'hd',
): Promise<{ uri: string; name: string; mimeType: string }> {
  const maxEdge = quality === 'hd' ? WA_PHOTO_HD_MAX_EDGE : WA_PHOTO_MAX_EDGE
  const compress = quality === 'hd' ? 0.9 : 0.78
  const fallbackEdge = quality === 'hd' ? 3072 : maxEdge
  const fallbackCompress = quality === 'hd' ? 0.82 : 0.65

  let encoded = await encodeJpeg(uri, maxEdge, compress)
  let bytes = await fileBytes(encoded.uri)

  if (bytes > WA_IMAGE_MAX_BYTES) {
    encoded = await encodeJpeg(uri, fallbackEdge, fallbackCompress)
    bytes = await fileBytes(encoded.uri)
  }

  if (bytes < 1) {
    throw new Error('Could not prepare image for upload.')
  }
  if (bytes > WA_IMAGE_MAX_BYTES) {
    throw new Error(
      quality === 'hd'
        ? 'Image is too large even in HD. Try Standard quality or a smaller photo.'
        : 'Image is too large to send. Try a smaller photo.',
    )
  }

  const dest = `${FileSystem.cacheDirectory}wa-img-${Date.now()}.jpg`
  await FileSystem.copyAsync({ from: encoded.uri, to: dest })

  return {
    uri: dest,
    name: `photo-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
  }
}
