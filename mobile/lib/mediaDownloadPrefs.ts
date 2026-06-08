import { appStorage } from '@/lib/appStorage'
import type { MessageType } from '@/types'

export type DownloadPolicy = 'always' | 'wifi' | 'never'

/** Per-network auto-download policy (WhatsApp Storage & data grid). */
export type NetworkDownloadPrefs = {
  cellular: DownloadPolicy
  wifi: DownloadPolicy
}

export type MediaDownloadPrefs = {
  photo: NetworkDownloadPrefs
  video: NetworkDownloadPrefs
  audio: NetworkDownloadPrefs
  document: NetworkDownloadPrefs
}

const KEY = 'media-download-prefs-v2'
const LEGACY_KEY = 'media-download-prefs'

const DEFAULTS: MediaDownloadPrefs = {
  photo: { cellular: 'always', wifi: 'always' },
  video: { cellular: 'never', wifi: 'always' },
  audio: { cellular: 'always', wifi: 'always' },
  document: { cellular: 'never', wifi: 'always' },
}

let cachedPrefs: MediaDownloadPrefs | null = null
let prefsLoad: Promise<MediaDownloadPrefs> | null = null
const prefListeners = new Set<() => void>()

function notifyPrefListeners() {
  prefListeners.forEach((cb) => cb())
}

function migrateLegacyPrefs(raw: Record<string, unknown>): MediaDownloadPrefs {
  const next = { ...DEFAULTS }
  for (const kind of ['photo', 'video', 'audio', 'document'] as const) {
    const v = raw[kind]
    if (typeof v === 'string') {
      next[kind] = { cellular: v as DownloadPolicy, wifi: v as DownloadPolicy }
    } else if (v && typeof v === 'object') {
      const o = v as Partial<NetworkDownloadPrefs>
      next[kind] = {
        cellular: o.cellular ?? DEFAULTS[kind].cellular,
        wifi: o.wifi ?? DEFAULTS[kind].wifi,
      }
    }
  }
  return next
}

export function subscribeMediaDownloadPrefs(listener: () => void): () => void {
  prefListeners.add(listener)
  return () => prefListeners.delete(listener)
}

/** Synchronous prefs accessor — returns null until the first async load completes. */
export function getMediaDownloadPrefsSync(): MediaDownloadPrefs | null {
  return cachedPrefs
}

export async function getMediaDownloadPrefs(): Promise<MediaDownloadPrefs> {
  if (cachedPrefs) return cachedPrefs
  if (!prefsLoad) {
    prefsLoad = (async () => {
      const raw = (await appStorage.getItem(KEY)) ?? (await appStorage.getItem(LEGACY_KEY))
      if (!raw) {
        cachedPrefs = { ...DEFAULTS }
        return cachedPrefs
      }
      try {
        cachedPrefs = migrateLegacyPrefs(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        cachedPrefs = { ...DEFAULTS }
      }
      return cachedPrefs
    })()
  }
  return prefsLoad
}

export async function setMediaDownloadPref(
  kind: keyof MediaDownloadPrefs,
  network: keyof NetworkDownloadPrefs,
  policy: DownloadPolicy,
): Promise<void> {
  const prefs = await getMediaDownloadPrefs()
  prefs[kind] = { ...prefs[kind], [network]: policy }
  cachedPrefs = { ...prefs }
  prefsLoad = Promise.resolve(cachedPrefs)
  await appStorage.setItem(KEY, JSON.stringify(prefs))
  notifyPrefListeners()
}

export function messageTypeToDownloadKind(
  type: MessageType,
): keyof MediaDownloadPrefs | null {
  switch (type) {
    case 'image':
      return 'photo'
    case 'sticker':
      return null
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'document':
      return 'document'
    default:
      return null
  }
}

export function policyAllowsDownload(prefs: NetworkDownloadPrefs, onWifi: boolean): boolean {
  const policy = onWifi ? prefs.wifi : prefs.cellular
  if (policy === 'never') return false
  if (policy === 'wifi' && !onWifi) return false
  return true
}
