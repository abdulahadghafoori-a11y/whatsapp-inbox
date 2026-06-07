import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'react-native'
import { WA_STICKER_MAX_BYTES } from '@/lib/waMediaLimits'

const WA_STICKER_MAX_EDGE = 512

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject)
  })
}

/** Resize WebP sticker to WhatsApp 512px cap before upload. */
export async function prepareStickerForSend(
  uri: string,
  filename: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const { width, height } = await imageSize(uri)
  const long = Math.max(width, height)
  const actions: ImageManipulator.Action[] =
    long > WA_STICKER_MAX_EDGE
      ? [
          {
            resize: {
              width: Math.round(width * (WA_STICKER_MAX_EDGE / long)),
              height: Math.round(height * (WA_STICKER_MAX_EDGE / long)),
            },
          },
        ]
      : []

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.92,
    format: ImageManipulator.SaveFormat.WEBP,
  })

  const info = await FileSystem.getInfoAsync(result.uri)
  const bytes =
    info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0
  if (bytes < 1) throw new Error('Could not prepare sticker for upload.')
  if (bytes > WA_STICKER_MAX_BYTES) {
    throw new Error('Sticker is too large (max 500KB on WhatsApp).')
  }

  const dest = `${FileSystem.cacheDirectory}wa-sticker-${Date.now()}.webp`
  await FileSystem.copyAsync({ from: result.uri, to: dest })

  const name = filename.toLowerCase().endsWith('.webp')
    ? filename
    : filename.replace(/\.[^.]+$/, '') + '.webp'

  return { uri: dest, name, mimeType: 'image/webp' }
}
