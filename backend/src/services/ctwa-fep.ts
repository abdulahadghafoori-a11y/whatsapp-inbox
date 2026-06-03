import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations } from '../db/schema.js'
import {
  canActivateCtwaFep,
  freeEntryPointExpiresAt,
  shapeMessagingFields,
} from '../utils/messaging-windows.js'

/** Open the 72h CTWA free entry point after a qualifying business reply. */
export async function tryActivateCtwaFep(conversationId: string): Promise<void> {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  })
  if (!conv || !canActivateCtwaFep(conv)) return

  const fepExpiresAt = freeEntryPointExpiresAt(new Date())
  await db
    .update(conversations)
    .set({ fepExpiresAt })
    .where(eq(conversations.id, conversationId))
}

export async function loadMessagingPayload(conversationId: string) {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  })
  if (!conv) return undefined
  return shapeMessagingFields(conv)
}
