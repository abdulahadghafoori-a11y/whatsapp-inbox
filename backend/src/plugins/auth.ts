import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import { assertNotRevoked, type AccessTokenPayload } from '../utils/jwt.js'
import { errors } from '../utils/errors.js'

/**
 * Registers @fastify/jwt for short-lived (15 min) access tokens and decorates:
 *  - `app.authenticate`  preHandler that verifies the JWT AND the revocation flag
 *  - `app.requireRole()` preHandler factory for role-gated routes
 *
 * Refresh tokens are NOT JWTs — they live in the refresh_tokens table (see auth routes).
 */
export const authPlugin = fp(async (app) => {
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '15m' },
  })

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      throw errors.unauthorized('Invalid or expired token.')
    }
    const payload = request.user as AccessTokenPayload
    request.agent = await assertNotRevoked(payload)
  })

  app.decorate(
    'requireRole',
    (...roles: Array<'admin' | 'agent' | 'ai_agent'>) =>
      async (request: FastifyRequest) => {
        if (!request.agent) {
          throw errors.unauthorized()
        }
        if (!roles.includes(request.agent.role as 'admin' | 'agent' | 'ai_agent')) {
          throw errors.forbidden('Insufficient permissions.')
        }
      },
  )
})
