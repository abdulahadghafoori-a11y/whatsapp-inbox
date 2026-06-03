/** Build `/media/...` path with encoded segments (S3 keys contain slashes). */
export function mediaApiPath(s3Key: string): string {
  return `/media/${s3Key.split('/').map(encodeURIComponent).join('/')}`
}
