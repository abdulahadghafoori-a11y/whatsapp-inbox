import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

const THUMB_DIR = `${FileSystem.documentDirectory ?? ''}wa-media/thumbs/`
const THUMB_MAX_WIDTH = 320

export function thumbPathForBlob(blobId: string): string {
  const safe = blobId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return `${THUMB_DIR}${safe}.jpg`
}

export async function ensureThumbDir(): Promise<boolean> {
  if (!FileSystem.documentDirectory) return false
  try {
    await FileSystem.makeDirectoryAsync(THUMB_DIR, { intermediates: true })
    return true
  } catch {
    return false
  }
}

/** Write a JPEG chat thumbnail beside the full blob (WhatsApp-style on-device preview). */
export async function generateImageThumbFile(
  sourceUri: string,
  destUri: string,
): Promise<string | null> {
  if (!(await ensureThumbDir())) return null
  try {
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: THUMB_MAX_WIDTH } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    )
    await FileSystem.copyAsync({ from: result.uri, to: destUri })
    return destUri
  } catch {
    return null
  }
}
