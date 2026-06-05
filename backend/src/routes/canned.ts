import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { cannedResponses } from '../db/schema.js'
import { errors } from '../utils/errors.js'

export async function cannedResponseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/canned-responses
  app.get('/', async () => {
    const rows = await db
      .select()
      .from(cannedResponses)
      .orderBy(asc(cannedResponses.title))
    return { cannedResponses: rows }
  })

  // POST /api/canned-responses  { title, body, shortcut? }
  app.post('/', async (request, reply) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(80),
        body: z.string().trim().min(1).max(4096),
        shortcut: z.string().trim().max(40).optional(),
      })
      .parse(request.body)
    const [row] = await db
      .insert(cannedResponses)
      .values({
        title: body.title,
        body: body.body,
        shortcut: body.shortcut ?? null,
        createdBy: request.agent.id,
      })
      .returning()
    return reply.code(201).send({ cannedResponse: row })
  })

  // PATCH /api/canned-responses/:id
  app.patch('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z
      .object({
        title: z.string().trim().min(1).max(80).optional(),
        body: z.string().trim().min(1).max(4096).optional(),
        shortcut: z.string().trim().max(40).nullable().optional(),
      })
      .parse(request.body)
    const [row] = await db
      .update(cannedResponses)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.shortcut !== undefined ? { shortcut: body.shortcut } : {}),
      })
      .where(eq(cannedResponses.id, id))
      .returning()
    if (!row) throw errors.notFound('Canned response not found.')
    return { cannedResponse: row }
  })

  // DELETE /api/canned-responses/:id
  app.delete('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const [row] = await db
      .delete(cannedResponses)
      .where(eq(cannedResponses.id, id))
      .returning({ id: cannedResponses.id })
    if (!row) throw errors.notFound('Canned response not found.')
    return { ok: true }
  })
}
