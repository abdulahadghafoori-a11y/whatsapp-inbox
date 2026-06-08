import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  changeLog,
  conversations,
  contacts,
  messages,
  teamMembers,
  type Message,
} from '../db/schema.js'
import { shapeConversation } from '../utils/conversation-shape.js'
import { attachReplyPreviews } from '../utils/message-shape.js'
import { attachMediaMeta, attachReactions } from '../utils/message-enrichment.js'

type SyncChange =
  | { entity: 'message'; op: 'upsert'; seq: number; data: unknown }
  | { entity: 'conversation'; op: 'upsert'; seq: number; data: unknown }
  | { entity: 'message' | 'conversation'; op: 'delete'; seq: number; id: string }

/**
 * Delta-sync feed. Clients pull everything that changed after their cursor and
 * apply it to the device SQLite source of truth. The socket layer only nudges
 * clients to pull; correctness lives here.
 */
export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/sync?since=<seq>&limit=<n>
  app.get('/', async (request) => {
    const q = z
      .object({
        since: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .parse(request.query)

    const rows = await db
      .select()
      .from(changeLog)
      .where(gt(changeLog.seq, q.since))
      .orderBy(asc(changeLog.seq))
      .limit(q.limit)

    if (rows.length === 0) {
      const head = await db
        .select({ seq: sql<number>`coalesce(max(${changeLog.seq}), 0)` })
        .from(changeLog)
      return { changes: [], cursor: Number(head[0]?.seq ?? q.since), hasMore: false }
    }

    const cursor = Number(rows[rows.length - 1]!.seq)
    const hasMore = rows.length === q.limit

    // Collapse to the latest entry per entity; we only need its final state.
    const latest = new Map<string, (typeof rows)[number]>()
    for (const r of rows) latest.set(`${r.entity}:${r.entityId}`, r)
    const collapsed = [...latest.values()].sort((a, b) => Number(a.seq) - Number(b.seq))

    const messageIds = collapsed
      .filter((r) => r.entity === 'message' && r.op !== 'delete')
      .map((r) => r.entityId)
    const conversationIds = collapsed
      .filter((r) => r.entity === 'conversation' && r.op !== 'delete')
      .map((r) => r.entityId)

    const [messageById, conversationById] = await Promise.all([
      loadMessages(messageIds),
      loadConversations(conversationIds),
    ])

    const changes: SyncChange[] = []
    for (const r of collapsed) {
      const seq = Number(r.seq)
      if (r.entity === 'message') {
        const m = r.op === 'delete' ? undefined : messageById.get(r.entityId)
        // Missing or hard-deleted -> tell the client to drop it.
        if (!m) changes.push({ entity: 'message', op: 'delete', seq, id: r.entityId })
        else changes.push({ entity: 'message', op: 'upsert', seq, data: m })
      } else {
        const c = r.op === 'delete' ? undefined : conversationById.get(r.entityId)
        // Missing OR soft-deleted -> remove from the inbox.
        if (!c) changes.push({ entity: 'conversation', op: 'delete', seq, id: r.entityId })
        else changes.push({ entity: 'conversation', op: 'upsert', seq, data: c })
      }
    }

    return { changes, cursor, hasMore }
  })

  // GET /api/sync/head — current cursor, for fast-forwarding a fresh device.
  app.get('/head', async () => {
    const head = await db
      .select({ seq: sql<number>`coalesce(max(${changeLog.seq}), 0)` })
      .from(changeLog)
    return { cursor: Number(head[0]?.seq ?? 0) }
  })
}

async function loadMessages(ids: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>()
  if (ids.length === 0) return out
  const rows = (await db
    .select()
    .from(messages)
    .where(inArray(messages.id, ids))) as Message[]
  const shaped = await attachMediaMeta(await attachReactions(await attachReplyPreviews(rows)))
  for (const m of shaped) out.set(m.id, m)
  return out
}

async function loadConversations(ids: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>()
  if (ids.length === 0) return out
  const rows = await db
    .select({
      conversation: conversations,
      contact: contacts,
      assignedName: teamMembers.name,
      assignedAvatar: teamMembers.avatarUrl,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(teamMembers, eq(conversations.assignedTo, teamMembers.id))
    .where(inArray(conversations.id, ids))

  for (const r of rows) {
    // Soft-deleted conversations are intentionally excluded -> emitted as deletes.
    if (r.conversation.deletedAt) continue
    out.set(
      r.conversation.id,
      shapeConversation(r.conversation, r.contact, r.assignedName, r.assignedAvatar),
    )
  }
  return out
}
