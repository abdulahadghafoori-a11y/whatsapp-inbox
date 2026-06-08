export type ImageMediaMeta = {
  mediaFileSize: number
  mediaThumbUrl: string | null
}

/** Record stored byte size; thumbs left null until CDN/Phase D. */
export async function enrichImageMediaMeta(
  _s3: { uploadToS3IfMissing: (key: string, body: Buffer, mime: string) => Promise<unknown> },
  buffer: Buffer,
  _mime: string,
  _filename: string,
): Promise<ImageMediaMeta> {
  return { mediaFileSize: buffer.length, mediaThumbUrl: null }
}
