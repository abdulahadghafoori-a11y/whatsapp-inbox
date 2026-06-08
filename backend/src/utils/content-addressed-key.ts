import { createHash } from 'node:crypto'

export function extFromFilename(filename: string, mime: string): string {
  if (filename.includes('.')) {
    const ext = filename.slice(filename.lastIndexOf('.'))
    if (ext.length <= 6) return ext.toLowerCase()
  }
  if (mime.startsWith('image/')) {
    if (mime.includes('png')) return '.png'
    if (mime.includes('webp')) return '.webp'
    if (mime.includes('gif')) return '.gif'
    return '.jpg'
  }
  if (mime.startsWith('video/')) return '.mp4'
  if (mime.startsWith('audio/')) {
    if (mime.includes('ogg') || mime.includes('opus')) return '.ogg'
    if (mime.includes('amr')) return '.amr'
    return '.m4a'
  }
  return '.bin'
}

export interface ContentAddressedParts {
  /** SHA-256 hex digest of the bytes — the blob's stable identity. */
  sha256: string
  /** Object storage key: media/blobs/<sha256>.<ext>. */
  key: string
  ext: string
}

/** SHA-256 content-addressed key + hash — identical bytes share one object. */
export function contentAddressedKeyParts(
  buffer: Buffer,
  filename: string,
  mime: string,
): ContentAddressedParts {
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const ext = extFromFilename(filename, mime)
  return { sha256, key: `media/blobs/${sha256}${ext}`, ext }
}

/** SHA-256 content-addressed S3 key — identical bytes share one object. */
export function contentAddressedKey(buffer: Buffer, filename: string, mime: string): string {
  return contentAddressedKeyParts(buffer, filename, mime).key
}
