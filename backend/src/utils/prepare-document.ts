import { errors } from './errors.js'
import { WA_DOCUMENT_MAX_BYTES } from './wa-media-limits.js'

export type PreparedDocument = {
  buffer: Buffer
  mime: string
  filename: string
}

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.apk',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.vbs',
  '.js',
  '.jar',
  '.sh',
  '.dmg',
  '.app',
  '.deb',
  '.rpm',
])

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

/** Safe display name for WhatsApp document upload (no path segments or control chars). */
export function sanitizeDocumentFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').trim()
  const cleaned = base.slice(0, 240)
  return cleaned || `document-${Date.now()}.bin`
}

function normalizeDocumentMime(mime: string, filename: string): string {
  const m = mime.toLowerCase().split(';')[0].trim()
  if (m && m !== 'application/octet-stream') return m
  return MIME_BY_EXT[extOf(filename)] ?? 'application/octet-stream'
}

/**
 * Validate and normalize documents for WhatsApp (no re-encoding — same as official app).
 */
export async function prepareDocumentForWhatsApp(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
): Promise<PreparedDocument> {
  if (buffer.length < 1) {
    throw errors.validation('Document is empty.')
  }

  const safeName = sanitizeDocumentFilename(filename)
  const ext = extOf(safeName)

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw errors.validation('This file type cannot be sent on WhatsApp.')
  }

  if (buffer.length > WA_DOCUMENT_MAX_BYTES) {
    throw errors.mediaTooLarge(
      `Document exceeds WhatsApp's ${Math.round(WA_DOCUMENT_MAX_BYTES / (1024 * 1024))}MB limit.`,
    )
  }

  const mime = normalizeDocumentMime(mimeHint, safeName)
  return { buffer, mime, filename: safeName }
}
