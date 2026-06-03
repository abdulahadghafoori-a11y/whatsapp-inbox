import type { Conversation } from '../db/schema.js'

/** Customer service window: 24h from the user's last message. */
const CSW_MS = 24 * 60 * 60 * 1000
/** CTWA free entry point: 72h after a qualifying business reply. */
const FEP_MS = 72 * 60 * 60 * 1000
/** Business must reply within this window after CTWA start to open FEP. */
const CTWA_REPLY_MS = 24 * 60 * 60 * 1000

export function customerServiceWindowExpiresAt(userMessageTimestampSec: number): Date {
  return new Date(userMessageTimestampSec * 1000 + CSW_MS)
}

export function isCustomerServiceWindowOpen(windowExpiresAt: Date | null): boolean {
  return !!windowExpiresAt && windowExpiresAt.getTime() > Date.now()
}

export function freeEntryPointExpiresAt(businessReplyAt: Date): Date {
  return new Date(businessReplyAt.getTime() + FEP_MS)
}

export function isFreeEntryPointOpen(fepExpiresAt: Date | null): boolean {
  return !!fepExpiresAt && fepExpiresAt.getTime() > Date.now()
}

export function effectiveCtwaStartedAt(
  c: Pick<Conversation, 'ctwaStartedAt' | 'ctwaClid' | 'createdAt'>,
): Date | null {
  if (c.ctwaStartedAt) return c.ctwaStartedAt
  if (c.ctwaClid) return c.createdAt
  return null
}

export function isCtwaLead(
  c: Pick<Conversation, 'ctwaClid' | 'ctwaStartedAt' | 'createdAt'>,
): boolean {
  return effectiveCtwaStartedAt(c) != null
}

export function canActivateCtwaFep(
  c: Pick<Conversation, 'ctwaStartedAt' | 'ctwaClid' | 'createdAt' | 'fepExpiresAt'>,
  now = new Date(),
): boolean {
  if (c.fepExpiresAt) return false
  const started = effectiveCtwaStartedAt(c)
  if (!started) return false
  return now.getTime() <= started.getTime() + CTWA_REPLY_MS
}

export type MessagingState = {
  windowExpiresAt: Date | null
  fepExpiresAt: Date | null
  ctwaStartedAt: Date | null
  isWindowOpen: boolean
  isFepOpen: boolean
  isCtwaLead: boolean
  canSendSession: boolean
  canSendTemplate: boolean
  needsTemplateForReply: boolean
}

export function resolveMessagingState(
  c: Pick<
    Conversation,
    | 'windowExpiresAt'
    | 'fepExpiresAt'
    | 'ctwaClid'
    | 'ctwaStartedAt'
    | 'createdAt'
  >,
): MessagingState {
  const isWindowOpen = isCustomerServiceWindowOpen(c.windowExpiresAt)
  const isFepOpen = isFreeEntryPointOpen(c.fepExpiresAt)
  const isCtwa = isCtwaLead(c)
  const ctwaStartedAt = effectiveCtwaStartedAt(c)

  return {
    windowExpiresAt: c.windowExpiresAt,
    fepExpiresAt: c.fepExpiresAt,
    ctwaStartedAt,
    isWindowOpen,
    isFepOpen,
    isCtwaLead: isCtwa,
    canSendSession: isWindowOpen,
    canSendTemplate: true,
    needsTemplateForReply: !isWindowOpen,
  }
}

export function serializeMessagingState(c: MessagingState) {
  return {
    windowExpiresAt: c.windowExpiresAt?.toISOString() ?? null,
    fepExpiresAt: c.fepExpiresAt?.toISOString() ?? null,
    ctwaStartedAt: c.ctwaStartedAt?.toISOString() ?? null,
    isWindowOpen: c.isWindowOpen,
    isFepOpen: c.isFepOpen,
    isCtwaLead: c.isCtwaLead,
    canSendSession: c.canSendSession,
    canSendTemplate: c.canSendTemplate,
    needsTemplateForReply: c.needsTemplateForReply,
  }
}

export function shapeMessagingFields(
  c: Pick<
    Conversation,
    | 'windowExpiresAt'
    | 'fepExpiresAt'
    | 'ctwaClid'
    | 'ctwaStartedAt'
    | 'createdAt'
  >,
) {
  return serializeMessagingState(resolveMessagingState(c))
}
