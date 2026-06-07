import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../config.js'
import {
  emitConversationAssigned,
  emitConversationUpdated,
  emitMediaFailed,
  emitMediaReady,
  emitMessageDeleted,
  emitMessageStatus,
  emitMessageUpdated,
  emitNewMessage,
} from '../services/socket-events.js'
import type { Message } from '../db/schema.js'
import type { ShapedMessage } from '../utils/message-shape.js'
import { secureCompareStrings } from '../utils/secure-compare.js'

const emitBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('new_message'),
    conversationId: z.string().uuid(),
    message: z.record(z.unknown()),
    messaging: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('media_ready'),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    mediaUrl: z.string(),
  }),
  z.object({
    type: z.literal('media_failed'),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('message_status'),
    payload: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('message_updated'),
    conversationId: z.string().uuid(),
    message: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('message_deleted'),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('conversation_updated'),
    conversationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('conversation_assigned'),
    conversationId: z.string().uuid(),
    agentId: z.string().uuid(),
  }),
])

export async function internalRoutes(app: FastifyInstance) {
  app.post('/socket-emit', async (request, reply) => {
    const secret = request.headers['x-worker-secret']
    if (
      typeof secret !== 'string' ||
      !secureCompareStrings(secret, config.WORKER_INTERNAL_SECRET)
    ) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const body = emitBody.parse(request.body)

    switch (body.type) {
      case 'new_message':
        emitNewMessage(
          app.io,
          body.conversationId,
          body.message as Message,
          body.messaging as Parameters<typeof emitNewMessage>[3],
        )
        break
      case 'media_ready':
        emitMediaReady(app.io, body.conversationId, body.messageId, body.mediaUrl)
        break
      case 'media_failed':
        emitMediaFailed(app.io, body.conversationId, body.messageId)
        break
      case 'message_status':
        emitMessageStatus(app.io, body.payload as Parameters<typeof emitMessageStatus>[1])
        break
      case 'message_updated':
        emitMessageUpdated(
          app.io,
          body.conversationId,
          body.message as ShapedMessage,
        )
        break
      case 'message_deleted':
        emitMessageDeleted(app.io, body.conversationId, body.messageId)
        break
      case 'conversation_updated':
        emitConversationUpdated(app.io, body.conversationId)
        break
      case 'conversation_assigned':
        emitConversationAssigned(app.io, body.conversationId, body.agentId)
        break
    }

    return { ok: true }
  })
}
