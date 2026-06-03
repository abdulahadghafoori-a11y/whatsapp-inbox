import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers } from '../db/schema.js'

export async function teamRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/team  (human agents; AI agents flagged separately)
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

    const aiAgents = await db
      .select({ id: teamMembers.id, name: teamMembers.name })
      .from(teamMembers)
      .where(eq(teamMembers.role, 'ai_agent'))

    return { members, aiAgents }
  })

  // PATCH /api/team/me  (register Expo push token / profile)
  app.patch('/me', async (request) => {
    const body = z
      .object({
        expoPushToken: z.string().optional(),
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
