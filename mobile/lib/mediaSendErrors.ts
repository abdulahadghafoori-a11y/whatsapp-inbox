import axios from 'axios'
import { apiErrorMessage } from '@/services/api'

export function mediaSendErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; code?: string } | undefined
    const code = data?.code ?? ''
    const detail = data?.error ?? err.message
    if (code === 'WINDOW_EXPIRED' || detail.includes('WINDOW_EXPIRED')) {
      return 'Chat window closed. Send an approved template to reach this customer.'
    }
    if (err.code === 'ECONNABORTED' || detail.toLowerCase().includes('timeout')) {
      return 'Upload failed. Check your connection and try again.'
    }
    if (err.response?.status === 413 || detail.toLowerCase().includes('too large')) {
      return detail
    }
    if (err.response && err.response.status >= 500) {
      return "Couldn't reach the server. Try again shortly."
    }
    return detail
  }
  const msg = err instanceof Error ? err.message : 'Something went wrong'
  if (msg.includes('too large') || msg.includes('trim')) return msg
  return msg
}

export function outboundFailureLabel(errorMessage: string | null | undefined): string {
  if (!errorMessage) return "Couldn't send. Tap to retry."
  if (errorMessage.includes('WhatsApp') || errorMessage.includes('wa ')) {
    return "Couldn't reach WhatsApp. Tap to retry."
  }
  if (errorMessage.toLowerCase().includes('upload')) {
    return 'Upload failed. Tap to retry.'
  }
  return errorMessage
}
