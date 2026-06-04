import { useEffect, useState } from 'react'
import { Image as RNImage } from 'react-native'

export type PixelSize = { width: number; height: number }

/**
 * Resolve intrinsic image size for layout (local file:// or remote https).
 */
export function useImageDimensions(uri: string | null | undefined): PixelSize | null {
  const [size, setSize] = useState<PixelSize | null>(null)

  useEffect(() => {
    if (!uri) {
      setSize(null)
      return
    }

    let cancelled = false
    setSize(null)

    RNImage.getSize(
      uri,
      (width, height) => {
        if (!cancelled) setSize({ width, height })
      },
      () => {
        if (!cancelled) setSize({ width: 4, height: 3 })
      },
    )

    return () => {
      cancelled = true
    }
  }, [uri])

  return size
}
