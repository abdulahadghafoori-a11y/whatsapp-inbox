import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { conversations, teamMembers, conversationEvents, type Conversation } from '../db/schema.js'
import { config } from '../config.js'
import { enqueueJob } from './jobs.js'
import { emitConversationAssigned } from './socket-events.js'

/** Stable 0..99 bucket from a UUID string (deterministic, no DB round-trip). */
export function bucket(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h % 100
}

function shouldUseAI(conversation: Conversation): boolean {
  if (!config.AI_AGENT_ENABLED) return false
  if (conversation.routingLock === 'human_only') return false
  if (conversation.aiHandled) return false
  return bucket(conversation.id) < Math.round(config.AI_ROUTING_FRACTION * 100)
}

/**
 * Assigns an unassigned conversation to an AI agent (deterministic ~N%) or the
 * online human agent with the fewest open conversations. Falls back to leaving
 * it unassigned (visible in the "Unassigned" tab) when nobody is available.
 */
export async function routeConversation(
  conversation: Conversation,
  io: SocketIOServer,
  log: FastifyBaseLogger,
): Promise<void> {
  const fresh = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversation.id),
  })
  if (!fresh || fresh.assignedTo) return
  conversation = fresh

  const aiAgent = shouldUseAI(conversation)
    ? await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.role, 'ai_agent'), isNotNull(teamMembers.agentConfig)),
      })
    : null

  let assignTo: string | null = null
  let isAI = false

  if (aiAgent) {
    assignTo = aiAgent.id
    isAI = true
  } else {
    // Online human agent with the fewest open conversations.
    const rows = await db.execute<{ id: string }>(sql`
      SELECT tm.id AS id
      FROM team_members tm
      WHERE tm.role = 'agent' AND tm.is_online = true
      ORDER BY (
        SELECT COUNT(*) FROM conversations c
        WHERE c.assigned_to = tm.id AND c.status = 'open'
      ) ASC
      LIMIT 1
    `)
    assignTo = rows.rows[0]?.id ?? null
  }

  if (!assignTo) {
    log.info({ conversationId: conversation.id }, 'no agent available; left unassigned')
    return
  }

  // Was: two concurrent webhooks could both assign — only update if still unassigned.
  const claimed = await db
    .update(conversations)
    .set({ assignedTo: assignTo, aiHandled: isAI ? true : conversation.aiHandled })
    .where(and(eq(conversations.id, conversation.id), isNull(conversations.assignedTo)))
    .returning({ id: conversations.id })
  if (claimed.length === 0) {
    log.debug({ conversationId: conversation.id }, 'assignment race lost; already assigned')
    return
  }

  await db.insert(conversationEvents).values({
    conversationId: conversation.id,
    actorId: assignTo,
    type: 'assigned',
    payload: { isAI },
  })

  emitConversationAssigned(io, conversation.id, assignTo)

  if (isAI) {
    await enqueueJob('ai_agent_reply', {
      conversationId: conversation.id,
      agentId: assignTo,
    })
  } else {
    await enqueueJob('send_push_notification', {
      agentId: assignTo,
      title: 'New conversation assigned',
      body: conversation.lastMessagePreview ?? 'New message',
      data: { conversationId: conversation.id },
    })
  }
}
