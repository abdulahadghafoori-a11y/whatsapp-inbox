import { api } from '@/services/api'

const SHA_FROM_KEY = /media\/blobs\/([a-f0-9]{64})/

/** Content-addressed keys are `media/blobs/<sha256>.<ext>` — pull the hash out. */
export function sha256FromStorageKey(key: string | null | undefined): string | null {
  if (!key) return null
  return SHA_FROM_KEY.exec(key)?.[1] ?? null
}

// First-writer-wins on the server; this just avoids redundant posts per blob.
const attempted = new Set<string>()

export async function uploadThumbhash(input: {
  storageKey: string | null | undefined
  messageId: string
  thumbhash: string
  width?: number
  height?: number
}): Promise<void> {
  const sha = sha256FromStorageKey(input.storageKey)
  if (!sha || attempted.has(sha)) return
  attempted.add(sha)
  try {
    await api.post(`/media/${sha}/thumbhash`, {
      thumbhash: input.thumbhash,
      messageId: input.messageId,
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
    })
  } catch {
    // Best-effort — drop the guard so a later view can retry.
    attempted.delete(sha)
  }
}
