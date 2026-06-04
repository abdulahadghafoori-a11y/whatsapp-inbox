import { Dimensions } from 'react-native'

const { width: SCREEN_W } = Dimensions.get('window')

/** Max media width inside a message bubble (WhatsApp-like). */
export const BUBBLE_MEDIA_MAX_WIDTH = Math.min(SCREEN_W * 0.76, 320)
export const BUBBLE_MEDIA_MAX_HEIGHT = 380
export const BUBBLE_MEDIA_MIN_WIDTH = 96
export const BUBBLE_MEDIA_MIN_HEIGHT = 72
export const STICKER_BUBBLE_SIZE = 160

export function bubbleSizeFromPixelSize(
  pixelWidth: number,
  pixelHeight: number,
  opts?: { sticker?: boolean },
): { width: number; height: number } {
  if (opts?.sticker) {
    const edge = Math.min(STICKER_BUBBLE_SIZE, BUBBLE_MEDIA_MAX_WIDTH)
    return { width: edge, height: edge }
  }

  if (pixelWidth < 1 || pixelHeight < 1) {
    return { width: BUBBLE_MEDIA_MAX_WIDTH, height: Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.75) }
  }

  const aspect = pixelWidth / pixelHeight
  let width = BUBBLE_MEDIA_MAX_WIDTH
  let height = width / aspect

  if (height > BUBBLE_MEDIA_MAX_HEIGHT) {
    height = BUBBLE_MEDIA_MAX_HEIGHT
    width = height * aspect
  }

  if (aspect > 2.8) {
    width = BUBBLE_MEDIA_MAX_WIDTH
    height = Math.max(BUBBLE_MEDIA_MIN_HEIGHT, width / aspect)
  }

  if (aspect < 0.35) {
    height = BUBBLE_MEDIA_MAX_HEIGHT
    width = Math.max(BUBBLE_MEDIA_MIN_WIDTH, height * aspect)
  }

  width = Math.round(Math.max(BUBBLE_MEDIA_MIN_WIDTH, Math.min(BUBBLE_MEDIA_MAX_WIDTH, width)))
  height = Math.round(Math.max(BUBBLE_MEDIA_MIN_HEIGHT, Math.min(BUBBLE_MEDIA_MAX_HEIGHT, height)))

  return { width, height }
}
