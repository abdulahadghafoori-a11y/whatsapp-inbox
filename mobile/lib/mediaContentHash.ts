import * as Crypto from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import { resolveUploadUri } from '@/lib/uploadUri'

const MAX_FULL_HASH_BYTES = 20 * 1024 * 1024

/** SHA-256 hex digest of a local media file (used to dedupe uploads + on-device blobs). */
export async function hashMediaFile(uri: string): Promise<string | null> {
  const resolved = resolveUploadUri(uri)
  try {
    const info = await FileSystem.getInfoAsync(resolved)
    if (!info.exists || !('size' in info) || typeof info.size !== 'number') return null
    if (info.size < 1) return null
    if (info.size > MAX_FULL_HASH_BYTES) return null

    const base64 = await FileSystem.readAsStringAsync(resolved, {
      encoding: FileSystem.EncodingType.Base64,
    })
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
  } catch {
    return null
  }
}

export function hashBlobId(contentHash: string) {
  return `hash:${contentHash}`
}
