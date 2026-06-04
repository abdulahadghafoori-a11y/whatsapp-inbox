import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { messages } from '../db/schema.js'
import { errors } from './errors.js'

export async function resolveReplyTargets(
  conversationId: string,
  replyToMessageId?: string,
): Promise<{ replyToMessageId?: string; replyToWaMessageId?: string }> {
  if (!replyToMessageId) return {}
  const parent = await db.query.messages.findFirst({
    where: eq(messages.id, replyToMessageId),
    columns: { id: true, conversationId: true, waMessageId: true },
  })
  if (!parent || parent.conversationId !== conversationId) {
    throw errors.validation('Reply target not found in this conversation')
  }
  if (!parent.waMessageId) {
    throw errors.validation('Reply target is not available on WhatsApp yet')
  }
  return { replyToMessageId, replyToWaMessageId: parent.waMessageId }
}
