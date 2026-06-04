import type { ConversationListItem } from '@/types'
import { normalizeConversation } from '@/lib/conversation'

/** WhatsApp Business messaging windows (CSW 24h, CTWA FEP 72h). */
export type MessagingWindowKind =
  | 'session'
  | 'session_urgent'
  | 'ctwa_fep'
  | 'ctwa_reply'
  | 'template_only'
  | 'none'

export type MessagingWindowTimer = {
  kind: MessagingWindowKind
  /** ISO timestamp to count down toward, when applicable. */
  expiresAt: string | null
  shortLabel: string
  /** Shown under the chat header (CTWA reply nudge or templates-only). */
  bannerMessage: string | null
}

export function messagingWindowState(
  raw: ConversationListItem | null | undefined,
): MessagingWindowTimer | null {
  const model = messagingWindowTimer(raw)
  if (model.kind === 'none') return null
  return model
}

export function showHeaderWindowChip(model: MessagingWindowTimer): boolean {
  return model.kind !== 'template_only'
}

export function showUnderHeaderBar(model: MessagingWindowTimer): boolean {
  return model.kind === 'ctwa_reply' || model.kind === 'template_only'
}

const CTWA_REPLY_MS = 24 * 60 * 60 * 1000

export function msUntil(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, new Date(iso).getTime() - Date.now())
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ctwaReplyDeadline(ctwaStartedAt: string | null): string | null {
  if (!ctwaStartedAt) return null
  return new Date(new Date(ctwaStartedAt).getTime() + CTWA_REPLY_MS).toISOString()
}

/**
 * Primary active window for this chat (Meta CSW / CTWA FEP rules).
 * @see https://developers.facebook.com/docs/whatsapp/pricing#customer-service-conversations
 */
export function messagingWindowTimer(
  raw: ConversationListItem | null | undefined,
): MessagingWindowTimer {
  if (!raw) {
    return {
      kind: 'none',
      expiresAt: null,
      shortLabel: '',
      bannerMessage: null,
    }
  }

  const c = normalizeConversation(raw)
  const cswMs = msUntil(c.windowExpiresAt)
  const fepMs = msUntil(c.fepExpiresAt)
  const cswOpen = c.canSendSession
  const fepOpen = c.isFepOpen

  if (fepOpen && !cswOpen) {
    return {
      kind: 'ctwa_fep',
      expiresAt: c.fepExpiresAt,
      shortLabel: 'CTWA',
      bannerMessage: null,
    }
  }

  if (cswOpen) {
    const urgent = cswMs > 0 && cswMs < 2 * 60 * 60 * 1000
    const ctwaReply =
      c.isCtwaLead && !fepOpen && !c.fepExpiresAt ? ctwaReplyDeadline(c.ctwaStartedAt) : null
    const ctwaReplyMs = ctwaReply ? msUntil(ctwaReply) : 0

    if (c.isCtwaLead && !fepOpen && ctwaReplyMs > 0) {
      return {
        kind: 'ctwa_reply',
        expiresAt: ctwaReply,
        shortLabel: 'Reply',
        bannerMessage: 'Reply now to open the 72-hour free CTWA window.',
      }
    }

    return {
      kind: urgent ? 'session_urgent' : 'session',
      expiresAt: c.windowExpiresAt,
      shortLabel: 'Session',
      bannerMessage: null,
    }
  }

  return {
    kind: 'template_only',
    expiresAt: null,
    shortLabel: 'Templates',
    bannerMessage: 'Session closed. Only approved template messages can be sent.',
  }
}
