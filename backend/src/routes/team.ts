import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers } from '../db/schema.js'
import { EXPO_PUSH_TOKEN_RE } from '../services/push-notifications.js'

export async function teamRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/team  (human agents; used by assign sheet + admin team tab)
  app.get('/', async () => {
    const members = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        email: teamMembers.email,
        avatarUrl: teamMembers.avatarUrl,
        role: teamMembers.role,
        isOnline: teamMembers.isOnline,
        lastSeenAt: teamMembers.lastSeenAt,
      })
      .from(teamMembers)
      .where(ne(teamMembers.role, 'ai_agent'))

    return { members, aiAgents: [] }
  })

  // PATCH /api/team/me  (register Expo push token / profile)
  app.patch('/me', async (request) => {
    const body = z
      .object({
        // Nullable so the client can clear the token when push is disabled.
        expoPushToken: z
          .union([z.string().regex(EXPO_PUSH_TOKEN_RE, 'Invalid Expo push token'), z.null()])
          .optional(),
        avatarUrl: z.string().url().optional(),
      })
      .parse(request.body)

    const [updated] = await db
      .update(teamMembers)
      .set({
        ...(body.expoPushToken !== undefined ? { expoPushToken: body.expoPushToken } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      })
      .where(eq(teamMembers.id, request.agent.id))
      .returning({
        id: teamMembers.id,
        name: teamMembers.name,
        email: teamMembers.email,
        avatarUrl: teamMembers.avatarUrl,
        role: teamMembers.role,
      })

    return { agent: updated }
  })
}
