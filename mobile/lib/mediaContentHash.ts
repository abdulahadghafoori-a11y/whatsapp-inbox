import * as Crypto from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import { resolveUploadUri } from '@/lib/uploadUri'

const MAX_FULL_HASH_BYTES = 20 * 1024 * 1024
/** Large documents (send-as-document up to WA 100MB cap). */
const MAX_LARGE_HASH_BYTES = 100 * 1024 * 1024

async function sha256File(uri: string, maxBytes: number): Promise<string | null> {
  const resolved = resolveUploadUri(uri)
  try {
    const info = await FileSystem.getInfoAsync(resolved)
    if (!info.exists || !('size' in info) || typeof info.size !== 'number') return null
    if (info.size < 1) return null
    if (info.size > maxBytes) return null

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

/** SHA-256 hex digest of a local media file (used to dedupe uploads + on-device blobs). */
export async function hashMediaFile(uri: string): Promise<string | null> {
  return sha256File(uri, MAX_FULL_HASH_BYTES)
}

/** SHA-256 for larger prepared files (documents). */
export async function hashMediaFileLarge(uri: string): Promise<string | null> {
  return sha256File(uri, MAX_LARGE_HASH_BYTES)
}

/** Hash prepared outbound media — tries standard then large limit. */
export async function hashPreparedFile(uri: string): Promise<string | null> {
  return (await hashMediaFile(uri)) ?? (await hashMediaFileLarge(uri))
}

export function hashBlobId(contentHash: string) {
  return `hash:${contentHash}`
}
