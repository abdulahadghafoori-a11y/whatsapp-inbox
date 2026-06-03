import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { refreshTokens, teamMembers, type TeamMember } from '../db/schema.js'
import { errors } from '../utils/errors.js'

const REFRESH_TTL_DAYS = 30

function publicAgent(m: TeamMember) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    avatarUrl: m.avatarUrl,
    role: m.role,
    isOnline: m.isOnline,
  }
}

/** Issues an access JWT + a new opaque refresh token (`<id>.<secret>`). */
async function issueTokens(app: FastifyInstance, member: TeamMember) {
  const accessToken = await app.jwt.sign({ sub: member.id, role: member.role as 'admin' | 'agent' | 'ai_agent' })

  const secret = randomBytes(64).toString('hex')
  const tokenHash = await bcrypt.hash(secret, 10)
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)

  const [row] = await db
    .insert(refreshTokens)
    .values({ teamMemberId: member.id, tokenHash, expiresAt })
    .returning({ id: refreshTokens.id })

  return { accessToken, refreshToken: `${row.id}.${secret}` }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({ refreshToken: z.string().min(1) })

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request) => {
    const { email, password } = loginSchema.parse(request.body)

    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.email, email.toLowerCase()),
    })
    // ai_agent rows have no password and cannot log in.
    if (!member || member.role === 'ai_agent' || !member.passwordHash) {
      throw errors.unauthorized('Invalid credentials.')
    }
    const ok = await bcrypt.compare(password, member.passwordHash)
    if (!ok) throw errors.unauthorized('Invalid credentials.')

    const tokens = await issueTokens(app, member)
    return { ...tokens, agent: publicAgent(member) }
  })

  app.post('/refresh', async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body)
    const [id, secret] = refreshToken.split('.')
    if (!id || !secret) throw errors.unauthorized('Malformed refresh token.')

    const row = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.id, id),
    })
    if (!row) throw errors.unauthorized('Invalid refresh token.')

    const secretOk = await bcrypt.compare(secret, row.tokenHash)
    if (!secretOk) throw errors.unauthorized('Invalid refresh token.')

    // Reuse detection: a presented-but-already-revoked token => possible theft.
    if (row.revokedAt) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.teamMemberId, row.teamMemberId))
      await db
        .update(teamMembers)
        .set({ tokenRevokedAt: new Date() })
        .where(eq(teamMembers.id, row.teamMemberId))
      throw errors.unauthorized('Refresh token reuse detected. Please log in again.')
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw errors.unauthorized('Refresh token expired.')
    }

    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, row.teamMemberId),
    })
    if (!member) throw errors.unauthorized('Account no longer exists.')

    // Rotate: revoke the presented token, issue a fresh pair.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id))

    return issueTokens(app, member)
  })

  app.post('/logout', async (request) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (parsed.success) {
      const [id] = parsed.data.refreshToken.split('.')
      if (id) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.id, id))
      }
    }
    return { ok: true }
  })

  // Admin: instantly invalidate ALL tokens for an agent (e.g. offboarding).
  app.post(
    '/revoke-all',
    { preHandler: [app.authenticate, app.requireRole('admin')] },
    async (request) => {
      const body = z.object({ agentId: z.string().uuid() }).parse(request.body)
      await db
        .update(teamMembers)
        .set({ tokenRevokedAt: new Date() })
        .where(eq(teamMembers.id, body.agentId))
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.teamMemberId, body.agentId))
      return { ok: true }
    },
  )

  // Current authenticated agent.
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    return { agent: publicAgent(request.agent) }
  })
}
