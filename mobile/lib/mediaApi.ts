/** Build `/media/...` path; backend requires messageId to prevent presign IDOR. */
export function mediaApiPath(s3Key: string, messageId: string): string {
  const path = `/media/${s3Key.split('/').map(encodeURIComponent).join('/')}`
  return `${path}?messageId=${encodeURIComponent(messageId)}`
}
