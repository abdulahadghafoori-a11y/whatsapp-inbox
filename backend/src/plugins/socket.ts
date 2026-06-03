import fp from 'fastify-plugin'
import { Server as SocketIOServer } from 'socket.io'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers } from '../db/schema.js'
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
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const agentId = socket.data.agentId as string
    socket.join(`agent:${agentId}`)

    await markPresence(agentId, true)
    io.emit('agent_online', { agentId })

    socket.on('join_conversation', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        socket.join(`conversation:${conversationId}`)
      }
    })

    socket.on('leave_conversation', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`)
      }
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
