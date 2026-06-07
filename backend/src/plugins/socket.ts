import fp from 'fastify-plugin'
import { Server as SocketIOServer } from 'socket.io'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, teamMembers } from '../db/schema.js'
import { AppError } from '../utils/errors.js'
import { assertNotRevoked, type AccessTokenPayload } from '../utils/jwt.js'
import { corsOrigins } from '../config.js'

/**
 * Attaches Socket.io to the underlying HTTP server with the SAME JWT + revocation
 * check used by REST routes. Manages presence and conversation rooms.
 *
 * Rooms:
 *   - agent:{id}          per-agent (assignment + inbox events)
 *   - conversation:{id}   joined when an agent opens a chat
 */
export const socketPlugin = fp(async (app) => {
  const io = new SocketIOServer(app.server, {
    cors: { origin: corsOrigins() },
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return next(new Error('Unauthorized'))
      const payload = app.jwt.verify<AccessTokenPayload>(token)
      await assertNotRevoked(payload)
      socket.data.agentId = payload.sub
      socket.data.role = payload.role
      next()
    } catch (err) {
      if (err instanceof AppError && err.code === 'TOKEN_REVOKED') {
        return next(new Error('TOKEN_REVOKED'))
      }
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const agentId = socket.data.agentId as string
    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, agentId),
      columns: { name: true },
    })
    socket.data.agentName = member?.name ?? 'Agent'
    socket.join(`agent:${agentId}`)

    await markPresence(agentId, true)
    io.emit('agent_online', { agentId })

    // Was: join any UUID — now verify conversation exists before entering room.
    socket.on('join_conversation', async (conversationId: string) => {
      if (typeof conversationId !== 'string') return
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          conversationId,
        )
      if (!uuid) return
      const row = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)),
        columns: { id: true },
      })
      if (!row) return
      socket.join(`conversation:${conversationId}`)
    })

    socket.on('leave_conversation', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`)
      }
    })

    const emitTyping = (conversationId: string, typing: boolean) => {
      if (typeof conversationId !== 'string') return
      if (!socket.rooms.has(`conversation:${conversationId}`)) return
      socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
        conversationId,
        agentId,
        agentName: (socket.data.agentName as string) ?? 'Agent',
        typing,
      })
    }

    socket.on('typing_start', (conversationId: string) => {
      emitTyping(conversationId, true)
    })

    socket.on('typing_stop', (conversationId: string) => {
      emitTyping(conversationId, false)
    })

    // Optional heartbeat to refine presence (see plan: optional for v1).
    socket.on('presence_ping', async () => {
      await db
        .update(teamMembers)
        .set({ lastSeenAt: new Date() })
        .where(eq(teamMembers.id, agentId))
    })

    socket.on('disconnect', async () => {
      // Only flip offline when this agent has no other live sockets.
      const room = io.sockets.adapter.rooms.get(`agent:${agentId}`)
      if (!room || room.size === 0) {
        await markPresence(agentId, false)
        io.emit('agent_offline', { agentId })
      }
    })
  })

  app.decorate('io', io)

  app.addHook('onClose', async () => {
    await io.close()
  })
})

async function markPresence(agentId: string, online: boolean) {
  await db
    .update(teamMembers)
    .set({ isOnline: online, lastSeenAt: new Date() })
    .where(eq(teamMembers.id, agentId))
}
