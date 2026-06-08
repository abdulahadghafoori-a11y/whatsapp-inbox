import { getWifiSync, isOnWifi } from '@/lib/network'
import {
  getMediaDownloadPrefs,
  getMediaDownloadPrefsSync,
  messageTypeToDownloadKind,
  policyAllowsDownload,
  type DownloadPolicy,
  type MediaDownloadPrefs,
} from '@/lib/mediaDownloadPrefs'
import { isStickerType } from '@/lib/messageMediaKind'
import type { Message, MessageType } from '@/types'

export type MediaAutoDownloadInput = {
  type: MessageType
  direction?: Message['direction']
}

export type AutoDownloadEval = { allowed: boolean; blockReason: string | null }

function evaluate(
  message: MediaAutoDownloadInput,
  prefs: MediaDownloadPrefs,
  onWifi: boolean,
): AutoDownloadEval {
  if (message.direction === 'outbound' || isStickerType(message.type)) {
    return { allowed: true, blockReason: null }
  }
  const kind = messageTypeToDownloadKind(message.type)
  if (!kind) return { allowed: true, blockReason: null }
  if (policyAllowsDownload(prefs[kind], onWifi)) return { allowed: true, blockReason: null }
  const policy = onWifi ? prefs[kind].wifi : prefs[kind].cellular
  if (policy === 'never') return { allowed: false, blockReason: 'Auto-download is off for this media type' }
  if (policy === 'wifi' && !onWifi) {
    return { allowed: false, blockReason: 'Connect to Wi‑Fi or tap to download' }
  }
  return { allowed: false, blockReason: 'Tap to download' }
}

/**
 * Single-read evaluation of allow + block reason. Used by the hook to avoid two
 * separate prefs/NetInfo round-trips per media bubble.
 */
export async function evaluateAutoDownload(
  message: MediaAutoDownloadInput,
): Promise<AutoDownloadEval> {
  if (message.direction === 'outbound' || isStickerType(message.type)) {
    return { allowed: true, blockReason: null }
  }
  const [prefs, onWifi] = await Promise.all([getMediaDownloadPrefs(), isOnWifi()])
  return evaluate(message, prefs, onWifi)
}

/** Synchronous evaluation from warm caches (null when caches are cold). */
export function evaluateAutoDownloadSync(
  message: MediaAutoDownloadInput,
): AutoDownloadEval | null {
  if (message.direction === 'outbound' || isStickerType(message.type)) {
    return { allowed: true, blockReason: null }
  }
  const prefs = getMediaDownloadPrefsSync()
  const onWifi = getWifiSync()
  if (!prefs || onWifi === null) return null
  return evaluate(message, prefs, onWifi)
}

/** WhatsApp-style auto-download gate (Storage & data settings). */
export async function isAutoDownloadAllowed(
  message: MediaAutoDownloadInput,
  opts?: { force?: boolean },
): Promise<boolean> {
  if (opts?.force) return true
  if (message.direction === 'outbound') return true
  if (isStickerType(message.type)) return true
  const kind = messageTypeToDownloadKind(message.type)
  if (!kind) return true
  const prefs = await getMediaDownloadPrefs()
  return policyAllowsDownload(prefs[kind], await isOnWifi())
}

export async function autoDownloadPolicyLabel(
  message: MediaAutoDownloadInput,
): Promise<DownloadPolicy | null> {
  const kind = messageTypeToDownloadKind(message.type)
  if (!kind) return null
  const prefs = await getMediaDownloadPrefs()
  const onWifi = await isOnWifi()
  return onWifi ? prefs[kind].wifi : prefs[kind].cellular
}

export async function autoDownloadBlockReason(
  message: MediaAutoDownloadInput,
): Promise<string | null> {
  if (message.direction === 'outbound' || isStickerType(message.type)) return null
  const kind = messageTypeToDownloadKind(message.type)
  if (!kind) return null
  const prefs = await getMediaDownloadPrefs()
  const onWifi = await isOnWifi()
  const policy = onWifi ? prefs[kind].wifi : prefs[kind].cellular
  if (policyAllowsDownload(prefs[kind], onWifi)) return null
  if (policy === 'never') return 'Auto-download is off for this media type'
  if (policy === 'wifi' && !onWifi) return 'Connect to Wi‑Fi or tap to download'
  return 'Tap to download'
}

export const MEDIA_LABEL: Partial<Record<MessageType, string>> = {
  image: 'Photo',
  sticker: 'Sticker',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
}
