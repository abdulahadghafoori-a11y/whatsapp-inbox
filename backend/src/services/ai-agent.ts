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
import { isCustomerServiceWindowOpen } from '../utils/messaging-windows.js'

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/** Returns the escalation reason when the model emitted ESCALATE:, otherwise null. */
export function parseEscalationSignal(replyText: string): string | null {
  const trimmed = replyText.trim()
  const match = /^ESCALATE:\s*(.*)$/is.exec(trimmed)
  if (!match) return null
  const reason = match[1]?.trim()
  return reason || 'Escalation requested'
}

async function inboundAwaitingReply(conversationId: string): Promise<boolean> {
  const latest = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
    orderBy: desc(messages.sentAt),
    columns: { direction: true },
  })
  return !!latest && latest.direction === 'inbound'
}

/**
 * Hands an AI-owned conversation back to a human: clears assignment, locks out
 * further AI routing, records an audit event, and re-routes to a human agent.
 */
async function escalateToHuman(
  io: SocketIOServer,
  log: FastifyBaseLogger,
  conversationId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({
      handoffRequestedAt: new Date(),
      handoffReason: reason,
      assignedTo: null,
      routingLock: 'human_only',
    })
    .where(eq(conversations.id, conversationId))

  await db.insert(conversationEvents).values({
    conversationId,
    actorId,
    type: 'handoff',
    payload: { reason },
  })

  emitConversationUpdated(io, conversationId)

  const fresh = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  })
  if (fresh) await routeConversation(fresh, io, log)
}

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

  // A human may have taken over (or escalation locked the thread) between enqueue
  // and execution. Don't let a stale AI job overwrite a human-owned conversation.
  if (conversation.routingLock === 'human_only' || conversation.assignedTo !== job.agentId) {
    log.info(
      { conversationId: job.conversationId, assignedTo: conversation.assignedTo },
      'ai reply skipped; conversation no longer AI-owned',
    )
    return
  }

  const recent = await db.query.messages.findMany({
    where: eq(messages.conversationId, job.conversationId),
    orderBy: desc(messages.sentAt),
    limit: 15,
  })

  // Coalesce duplicate jobs: if the latest message is already outbound, nothing to do.
  if (!(await inboundAwaitingReply(job.conversationId))) {
    log.debug({ conversationId: job.conversationId }, 'ai reply skipped; already answered')
    return
  }

  // Free-form session replies require an open customer service window.
  if (!isCustomerServiceWindowOpen(conversation.windowExpiresAt)) {
    log.info(
      { conversationId: job.conversationId },
      'ai reply skipped; customer service window closed',
    )
    return
  }

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

  let replyText = ''
  try {
    const response = await client.messages.create({
      model: cfg.model ?? DEFAULT_MODEL,
      max_tokens: 500,
      temperature: cfg.temperature ?? 0.7,
      system: systemPrompt,
      messages: history,
    })
    const first = response.content[0]
    replyText = first && first.type === 'text' ? first.text : ''
  } catch (err) {
    // LLM failure (bad key, rate limit, outage): hand off to a human instead of
    // leaving the customer with no reply. Was: uncaught -> job retried then
    // permanently failed silently with the conversation stuck on the AI.
    log.error({ err, conversationId: job.conversationId }, 'ai reply generation failed')
    await escalateToHuman(
      io,
      log,
      job.conversationId,
      job.agentId,
      'AI reply generation failed',
    )
    return
  }

  const escalationReason = parseEscalationSignal(replyText)
  if (escalationReason) {
    await escalateToHuman(io, log, job.conversationId, job.agentId, escalationReason)
    return
  }

  if (!replyText.trim()) {
    // Empty/non-text model output: escalate rather than send a blank message.
    log.warn({ conversationId: job.conversationId }, 'ai produced empty reply; escalating')
    await escalateToHuman(io, log, job.conversationId, job.agentId, 'AI produced no reply')
    return
  }

  // Re-check after the LLM round-trip — concurrent jobs may have already replied.
  const fresh = await db.query.conversations.findFirst({
    where: eq(conversations.id, job.conversationId),
    with: { contact: true },
  })
  if (
    !fresh?.contact ||
    fresh.assignedTo !== job.agentId ||
    fresh.routingLock === 'human_only' ||
    !isCustomerServiceWindowOpen(fresh.windowExpiresAt) ||
    !(await inboundAwaitingReply(job.conversationId))
  ) {
    log.info({ conversationId: job.conversationId }, 'ai reply skipped; state changed during generation')
    return
  }

  await createOutboundText(io, {
    conversationId: job.conversationId,
    to: fresh.contact.waId,
    body: replyText.trim(),
    sentBy: job.agentId,
  })
}
