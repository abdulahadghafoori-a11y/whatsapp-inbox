import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers, type TeamMember } from '../db/schema.js'
import { errors } from './errors.js'

export interface AccessTokenPayload {
  sub: string
  role: 'admin' | 'agent' | 'ai_agent'
  iat: number
  exp: number
}

/**
 * Shared revocation check used by both REST (`authenticate` preHandler) and
 * the Socket.io handshake so the two never drift.
 *
 * Returns the team member when the token is still valid; throws TOKEN_REVOKED
 * when the member's `tokenRevokedAt` is newer than the token's `iat`.
 */
export async function assertNotRevoked(
  payload: AccessTokenPayload,
): Promise<TeamMember> {
  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, payload.sub),
  })
  if (!member) throw errors.unauthorized('Account no longer exists.')

  if (member.tokenRevokedAt && payload.iat * 1000 < member.tokenRevokedAt.getTime()) {
    throw errors.tokenRevoked()
  }
  return member
}
