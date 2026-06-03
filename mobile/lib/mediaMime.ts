import type { MessageType } from '@/types'

export function messageTypeFromMime(mime: string): MessageType {
  if (mime.startsWith('image/')) return mime === 'image/webp' ? 'sticker' : 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export function normalizeUploadMime(mime: string, filename: string): string {
  const m = (mime ?? '').toLowerCase().trim()
  if (m === 'audio/x-m4a' || m === 'audio/m4a' || m === 'audio/aac') return 'audio/mp4'
  if (m && m !== 'application/octet-stream') return m
  const lower = filename.toLowerCase()
  if (lower.endsWith('.3gp') || lower.endsWith('.amr')) return 'audio/amr'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp4') && m.startsWith('audio/')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.mp4') || lower.endsWith('.mov')) return 'video/mp4'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return mime || 'application/octet-stream'
}
