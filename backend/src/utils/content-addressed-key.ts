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

/** SHA-256 content-addressed S3 key — identical bytes share one object. */
export function contentAddressedKey(buffer: Buffer, filename: string, mime: string): string {
  const hash = createHash('sha256').update(buffer).digest('hex')
  return `media/blobs/${hash}${extFromFilename(filename, mime)}`
}
