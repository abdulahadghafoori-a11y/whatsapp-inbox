import { appStorage } from '@/lib/appStorage'

/** Per-conversation composer draft persistence so typed text survives navigation. */
const key = (conversationId: string) => `wa-draft-${conversationId}`

export async function loadDraft(conversationId: string): Promise<string> {
  return (await appStorage.getItem(key(conversationId))) ?? ''
}

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  if (!text.trim()) {
    await appStorage.removeItem(key(conversationId))
    return
  }
  await appStorage.setItem(key(conversationId), text)
}

export async function clearDraft(conversationId: string): Promise<void> {
  await appStorage.removeItem(key(conversationId))
}
