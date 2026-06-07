import { Dimensions } from 'react-native'

const { width: SCREEN_W } = Dimensions.get('window')

export const BUBBLE_MEDIA_MAX_WIDTH = Math.min(SCREEN_W * 0.76, 308)
export const BUBBLE_MEDIA_MAX_HEIGHT = 300
export const BUBBLE_MEDIA_MIN_WIDTH = 96
export const BUBBLE_MEDIA_MIN_HEIGHT = 72
export const STICKER_BUBBLE_SIZE = 160

/**
 * Size in-chat media for the bubble. Only the exceeding dimension is clamped:
 * tall portraits keep full bubble width (cover crop); wide images keep height.
 */
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
    return {
      width: BUBBLE_MEDIA_MAX_WIDTH,
      height: Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.65),
    }
  }

  const aspect = pixelWidth / pixelHeight

  let width = Math.min(pixelWidth, BUBBLE_MEDIA_MAX_WIDTH)
  let height = width / aspect

  if (height > BUBBLE_MEDIA_MAX_HEIGHT) {
    height = BUBBLE_MEDIA_MAX_HEIGHT
    width = BUBBLE_MEDIA_MAX_WIDTH
  } else if (width > BUBBLE_MEDIA_MAX_WIDTH) {
    width = BUBBLE_MEDIA_MAX_WIDTH
    height = width / aspect
  }

  width = Math.round(Math.max(BUBBLE_MEDIA_MIN_WIDTH, Math.min(BUBBLE_MEDIA_MAX_WIDTH, width)))
  height = Math.round(Math.max(BUBBLE_MEDIA_MIN_HEIGHT, Math.min(BUBBLE_MEDIA_MAX_HEIGHT, height)))

  return { width, height }
}
