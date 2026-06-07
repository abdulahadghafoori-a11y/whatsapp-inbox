import { appStorage } from '@/lib/appStorage'
import type { MessageType } from '@/types'

export type DownloadPolicy = 'always' | 'wifi' | 'never'

export type MediaDownloadPrefs = {
  photo: DownloadPolicy
  video: DownloadPolicy
  audio: DownloadPolicy
  document: DownloadPolicy
}

const KEY = 'media-download-prefs'

const DEFAULTS: MediaDownloadPrefs = {
  photo: 'always',
  video: 'wifi',
  audio: 'always',
  document: 'wifi',
}

let cachedPrefs: MediaDownloadPrefs | null = null
let prefsLoad: Promise<MediaDownloadPrefs> | null = null

export async function getMediaDownloadPrefs(): Promise<MediaDownloadPrefs> {
  if (cachedPrefs) return cachedPrefs
  if (!prefsLoad) {
    prefsLoad = (async () => {
      const raw = await appStorage.getItem(KEY)
      if (!raw) {
        cachedPrefs = { ...DEFAULTS }
        return cachedPrefs
      }
      try {
        const parsed = JSON.parse(raw) as Partial<MediaDownloadPrefs>
        cachedPrefs = { ...DEFAULTS, ...parsed }
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
  policy: DownloadPolicy,
): Promise<void> {
  const prefs = await getMediaDownloadPrefs()
  prefs[kind] = policy
  cachedPrefs = { ...prefs }
  prefsLoad = Promise.resolve(cachedPrefs)
  await appStorage.setItem(KEY, JSON.stringify(prefs))
}

export function messageTypeToDownloadKind(
  type: MessageType,
): keyof MediaDownloadPrefs | null {
  switch (type) {
    case 'image':
    case 'sticker':
      return 'photo'
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
