import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mediaBlobs, messageReactions, teamMembers, type Message } from '../db/schema.js'

export type MessageReactionRow = {
  emoji: string
  agentId: string
  agentName: string | null
}

export type EnrichedMessage = Message & {
  replyTo?: unknown
  reactions: MessageReactionRow[]
}

export async function attachReactions<T extends Message>(
  rows: T[],
): Promise<(T & { reactions: MessageReactionRow[] })[]> {
  const ids = rows.map((m) => m.id)
  if (ids.length === 0) return rows.map((m) => ({ ...m, reactions: [] }))

  const rx = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      agentId: messageReactions.agentId,
      agentName: teamMembers.name,
    })
    .from(messageReactions)
    .innerJoin(teamMembers, eq(messageReactions.agentId, teamMembers.id))
    .where(inArray(messageReactions.messageId, ids))

  const byMessage = new Map<string, MessageReactionRow[]>()
  for (const row of rx) {
    const list = byMessage.get(row.messageId) ?? []
    list.push({
      emoji: row.emoji,
      agentId: row.agentId,
      agentName: row.agentName,
    })
    byMessage.set(row.messageId, list)
  }

  return rows.map((m) => ({
    ...m,
    reactions: byMessage.get(m.id) ?? [],
  }))
}

export type MediaMetaFields = {
  thumbhash: string | null
  mediaWidth: number | null
  mediaHeight: number | null
}

/**
 * Attach the content-addressed blob's ThumbHash + intrinsic dimensions so the
 * client can paint an instant placeholder before the full media decodes.
 * Batched by storage key (one query for the whole page).
 */
export async function attachMediaMeta<T extends Message>(
  rows: T[],
): Promise<(T & MediaMetaFields)[]> {
  const keys = [
    ...new Set(rows.map((m) => m.mediaUrl).filter((k): k is string => !!k)),
  ]
  if (keys.length === 0) {
    return rows.map((m) => ({
      ...m,
      thumbhash: null,
      mediaWidth: null,
      mediaHeight: null,
    }))
  }

  const blobs = await db
    .select({
      storageKey: mediaBlobs.storageKey,
      thumbhash: mediaBlobs.thumbhash,
      width: mediaBlobs.width,
      height: mediaBlobs.height,
    })
    .from(mediaBlobs)
    .where(inArray(mediaBlobs.storageKey, keys))

  const byKey = new Map(blobs.map((b) => [b.storageKey, b]))

  return rows.map((m) => {
    const b = m.mediaUrl ? byKey.get(m.mediaUrl) : undefined
    return {
      ...m,
      thumbhash: b?.thumbhash ?? null,
      mediaWidth: b?.width ?? null,
      mediaHeight: b?.height ?? null,
    }
  })
}
