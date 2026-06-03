import type { ConversationListItem } from '@/types'
import { normalizeConversation } from '@/lib/conversation'

export function hoursUntil(iso: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - Date.now()
  return ms > 0 ? ms / (1000 * 60 * 60) : 0
}

export type MessagingBannerModel = {
  variant: 'hidden' | 'csw_warning' | 'csw_closed' | 'fep_active' | 'fep_only'
  title: string
  body: string
}

export function messagingBanner(raw: ConversationListItem | null | undefined): MessagingBannerModel {
  if (!raw) return { variant: 'hidden', title: '', body: '' }
  const c = normalizeConversation(raw)

  const cswHours = hoursUntil(c.windowExpiresAt)
  const fepHours = hoursUntil(c.fepExpiresAt)
  const cswOpen = c.canSendSession
  const fepOpen = c.isFepOpen

  if (cswOpen && cswHours >= 2 && !c.isCtwaLead) {
    return { variant: 'hidden', title: '', body: '' }
  }

  if (cswOpen && cswHours < 2) {
    const label =
      cswHours >= 1
        ? `${Math.floor(cswHours)} hour${Math.floor(cswHours) === 1 ? '' : 's'}`
        : `${Math.ceil(cswHours * 60)} min`
    return {
      variant: 'csw_warning',
      title: 'Session window closing soon',
      body: `Free-form replies end in ${label}.${c.isCtwaLead ? ' CTWA 72h window opens after you reply.' : ''}`,
    }
  }

  if (!cswOpen && fepOpen && c.isCtwaLead) {
    const label =
      fepHours >= 1
        ? `${Math.floor(fepHours)}h`
        : `${Math.ceil(fepHours * 60)}m`
    return {
      variant: 'fep_active',
      title: 'CTWA 72-hour window active',
      body: `Session replies need a template, but CTWA templates are free for ${label} more. Reply with a template below.`,
    }
  }

  if (!cswOpen) {
    return {
      variant: 'csw_closed',
      title: c.isCtwaLead ? 'Session window closed (CTWA lead)' : 'Session window closed',
      body: c.isCtwaLead
        ? 'Send a template to re-engage. If you reply within 24h of their ad click, the 72h CTWA free window opens.'
        : 'Only approved Message Templates can be sent until they message you again.',
    }
  }

  if (c.isCtwaLead && cswOpen) {
    return {
      variant: 'fep_only',
      title: 'CTWA ad lead',
      body: 'Reply now to open the 72-hour free messaging window (Meta CTWA free entry point).',
    }
  }

  return { variant: 'hidden', title: '', body: '' }
}
