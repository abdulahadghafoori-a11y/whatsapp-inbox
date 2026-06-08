import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { refreshTokens, teamMembers, type TeamMember } from '../db/schema.js'
import { errors } from '../utils/errors.js'
import { BCRYPT_ROUNDS } from '../utils/bcrypt.js'
import { clearLoginAttempts, registerLoginAttempt } from '../utils/login-throttle.js'
import { parseRefreshToken } from '../utils/refresh-token.js'

const REFRESH_TTL_DAYS = 30

/** Constant-time decoy: compared against when the email is unknown. */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('login-timing-decoy', BCRYPT_ROUNDS)

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
  const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)
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
  // Was: only global 100/min — dedicated limit reduces brute-force on credentials.
  app.post(
    '/login',
    {
      config: {
        // IP-only here (keyGenerator runs before body parse). Per-email throttle
        // is enforced in the handler via registerLoginAttempt.
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
          keyGenerator: (req) => req.ip,
        },
      },
    },
    async (request) => {
      const { email, password } = loginSchema.parse(request.body)
      const normalizedEmail = email.toLowerCase()
      if (!(await registerLoginAttempt(request.ip, normalizedEmail))) {
        throw errors.loginThrottled()
      }

      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.email, normalizedEmail),
      })
      // ai_agent rows have no password and cannot log in. Always run a bcrypt
      // compare (against a dummy hash for unknown users) to avoid a timing
      // side-channel that reveals whether an email exists.
      const passwordHash = member?.passwordHash ?? DUMMY_BCRYPT_HASH
      const ok = await bcrypt.compare(password, passwordHash)
      if (!member || member.role === 'ai_agent' || !member.passwordHash || !ok) {
        throw errors.unauthorized('Invalid credentials.')
      }

      await clearLoginAttempts(request.ip, normalizedEmail)
      const tokens = await issueTokens(app, member)
      return { ...tokens, agent: publicAgent(member) }
    },
  )

  app.post(
    '/refresh',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
          keyGenerator: (req) => req.ip,
        },
      },
    },
    async (request) => {
      const { refreshToken } = refreshSchema.parse(request.body)
      const { id, secret } = parseRefreshToken(refreshToken)

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

      // Honor a global session revoke (admin offboarding / reuse detection) even if
      // this particular refresh row was not individually revoked.
      if (member.tokenRevokedAt && row.createdAt.getTime() < member.tokenRevokedAt.getTime()) {
        throw errors.unauthorized('Session revoked. Please log in again.')
      }

      // Rotate atomically: the neon-http driver has no interactive transactions, so
      // we revoke with `WHERE revoked_at IS NULL` and require exactly one row. Two
      // concurrent refreshes with the same token have a single winner; the loser
      // gets a benign error without revoking the winner's new session.
      const claimed = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id })

      // Lost the atomic claim race (concurrent refresh with the same token). The
      // winner already rotated — do not treat this as theft or revoke their session.
      if (claimed.length === 0) {
        throw errors.unauthorized('Refresh token already used.')
      }

      return issueTokens(app, member)
    },
  )

  app.post('/logout', async (request) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (parsed.success) {
      try {
        const { id, secret } = parseRefreshToken(parsed.data.refreshToken)
        // Verify the secret before revoking so a known/guessed token id can't be
        // used to terminate another agent's session.
        const row = await db.query.refreshTokens.findFirst({
          where: eq(refreshTokens.id, id),
        })
        if (row && (await bcrypt.compare(secret, row.tokenHash))) {
          await db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.id, id))
        }
      } catch {
        // Malformed token — still return ok (logout is best-effort).
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
      const target = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.id, body.agentId),
      })
      if (!target) throw errors.notFound('Agent not found.')
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
