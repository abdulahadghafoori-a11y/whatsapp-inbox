import { and, eq, isNull } from 'drizzle-orm'
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
  // Only one concurrent outbound should open FEP (first qualifying reply wins).
  await db
    .update(conversations)
    .set({ fepExpiresAt })
    .where(and(eq(conversations.id, conversationId), isNull(conversations.fepExpiresAt)))
}

export async function loadMessagingPayload(conversationId: string) {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  })
  if (!conv) return undefined
  return shapeMessagingFields(conv)
}
