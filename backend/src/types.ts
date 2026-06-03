import type { Server as SocketIOServer } from 'socket.io'
import type { TeamMember } from './db/schema.js'
import type { S3Service } from './services/s3.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer
    s3: S3Service
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (
      ...roles: Array<'admin' | 'agent' | 'ai_agent'>
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    /** Full team member, attached by the `authenticate` preHandler. */
    agent: TeamMember
    /** Raw request body, populated only for the webhook route (HMAC verify). */
    rawBody?: Buffer
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: 'admin' | 'agent' | 'ai_agent' }
    user: {
      sub: string
      role: 'admin' | 'agent' | 'ai_agent'
      iat: number
      exp: number
    }
  }
}
