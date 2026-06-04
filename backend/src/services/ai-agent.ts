import Anthropic from '@anthropic-ai/sdk'
import { desc, eq } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import {
  conversations,
  messages,
  teamMembers,
  conversationEvents,
  type AgentConfig,
} from '../db/schema.js'
import { config } from '../config.js'
import { createOutboundText } from './outbound.js'
import { emitConversationUpdated } from './socket-events.js'
import { routeConversation } from './router.js'

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Generates and sends an AI reply for a conversation. Detects the `ESCALATE:`
 * signal and hands the conversation back to a human (locking out further AI
 * routing) instead of replying.
 */
export async function processAIAgentReply(
  io: SocketIOServer,
  log: FastifyBaseLogger,
  job: { conversationId: string; agentId: string },
): Promise<void> {
  const agent = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, job.agentId),
  })
  if (!agent) {
    log.warn({ agentId: job.agentId }, 'ai agent not found; skipping reply')
    return
  }

  const cfg = (agent.agentConfig ?? {}) as Partial<AgentConfig>

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, job.conversationId),
    with: { contact: true },
  })
  if (!conversation || !conversation.contact) {
    log.warn({ conversationId: job.conversationId }, 'conversation/contact missing')
    return
  }

  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, job.conversationId),
    orderBy: desc(messages.sentAt),
    limit: 15,
  })

  const systemPrompt = `${cfg.systemPrompt ?? 'You are a helpful sales assistant.'}

Customer name: ${conversation.contact.name ?? 'Unknown'}
Ad clicked: ${conversation.adTitle ?? 'Unknown'}
Campaign: ${conversation.ctwaClid ?? 'Unknown'}

If at any point you cannot help, the customer is upset, or the query is complex,
respond with exactly: ESCALATE:<reason>`

  const history = recent
    .slice()
    .reverse()
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.body ?? '[media message]',
    }))

  if (history.length === 0) return

  const response = await client.messages.create({
    model: cfg.model ?? DEFAULT_MODEL,
    max_tokens: 500,
    temperature: cfg.temperature ?? 0.7,
    system: systemPrompt,
    messages: history,
  })

  const first = response.content[0]
  const replyText = first && first.type === 'text' ? first.text : ''

  if (replyText.startsWith('ESCALATE:')) {
    const reason = replyText.replace('ESCALATE:', '').trim()
    await db
      .update(conversations)
      .set({
        handoffRequestedAt: new Date(),
        handoffReason: reason,
        assignedTo: null,
        routingLock: 'human_only',
      })
      .where(eq(conversations.id, job.conversationId))

    await db.insert(conversationEvents).values({
      conversationId: job.conversationId,
      actorId: job.agentId,
      type: 'handoff',
      payload: { reason },
    })

    emitConversationUpdated(io, job.conversationId)

    // Refetch the (now-unassigned, human_only) row before re-routing to a human.
    const fresh = await db.query.conversations.findFirst({
      where: eq(conversations.id, job.conversationId),
    })
    if (fresh) await routeConversation(fresh, io, log)
    return
  }

  await createOutboundText(io, {
    conversationId: job.conversationId,
    to: conversation.contact.waId,
    body: replyText,
    sentBy: job.agentId,
  })
}
