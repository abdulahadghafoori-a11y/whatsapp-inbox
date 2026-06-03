import { inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { messages, type Message } from '../db/schema.js'

export type ReplyPreview = {
  id: string
  direction: string
  type: string
  body: string | null
  deletedAt: Date | null
}

export type ShapedMessage = Message & {
  replyTo: ReplyPreview | null
}

export async function attachReplyPreviews(rows: Message[]): Promise<ShapedMessage[]> {
  const replyIds = [
    ...new Set(
      rows.map((m) => m.replyToMessageId).filter((id): id is string => !!id),
    ),
  ]
  if (replyIds.length === 0) {
    return rows.map((m) => ({ ...m, replyTo: null }))
  }

  const parents = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      type: messages.type,
      body: messages.body,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(inArray(messages.id, replyIds))

  const byId = new Map(parents.map((p) => [p.id, p]))

  return rows.map((m) => ({
    ...m,
    replyTo: m.replyToMessageId ? byId.get(m.replyToMessageId) ?? null : null,
  }))
}
