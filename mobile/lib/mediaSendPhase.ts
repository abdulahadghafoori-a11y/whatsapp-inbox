import type { Message } from '@/types'

export type MediaSendPhase = 'preparing' | 'uploading' | 'sending' | 'queued'

export function mediaSendOverlayLabel(message: Message): string | null {
  if (message.direction !== 'outbound' || message.status !== 'pending') return null
  const phase = message.sendPhase
  const meta = message.metadata as { compressProgress?: number; uploadProgress?: number } | null | undefined
  if (phase === 'preparing') {
    const pct =
      typeof meta?.compressProgress === 'number'
        ? ` ${Math.round(meta.compressProgress * 100)}%`
        : ''
    return `Preparing…${pct}`
  }
  if (phase === 'uploading') {
    const pct =
      typeof meta?.uploadProgress === 'number'
        ? ` ${Math.round(meta.uploadProgress * 100)}%`
        : ''
    return `Uploading…${pct}`
  }
  if (phase === 'queued') return 'Waiting for connection…'
  if (phase === 'sending' || message.mediaUrl) return 'Sending…'
  if (message.localPreviewUri) return 'Uploading…'
  return 'Sending…'
}
