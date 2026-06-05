import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tags } from '../db/schema.js'
import { errors } from '../utils/errors.js'

export async function tagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/tags
  app.get('/', async () => {
    const rows = await db.select().from(tags).orderBy(asc(tags.name))
    return { tags: rows }
  })

  // POST /api/tags  { name, color? }
  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        color: z.string().trim().max(20).optional(),
      })
      .parse(request.body)
    const [row] = await db
      .insert(tags)
      .values({ name: body.name, color: body.color ?? null })
      .onConflictDoNothing({ target: tags.name })
      .returning()
    if (!row) {
      // Name already exists — return the existing row for idempotency.
      const existing = await db.query.tags.findFirst({ where: eq(tags.name, body.name) })
      return reply.code(200).send({ tag: existing })
    }
    return reply.code(201).send({ tag: row })
  })

  // DELETE /api/tags/:id  (admin only — affects the whole workspace)
  app.delete(
    '/:id',
    { preHandler: [app.requireRole('admin')] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
      const [row] = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id })
      if (!row) throw errors.notFound('Tag not found.')
      return { ok: true }
    },
  )
}
