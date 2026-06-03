import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { errors } from '../utils/errors.js'

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/media/*  (the S3 key contains slashes -> wildcard param)
  app.get('/*', async (request) => {
    const key = (request.params as Record<string, string>)['*']
    z.string().min(1).parse(key)
    // Only ever sign keys under the managed media/ prefix.
    if (!key.startsWith('media/')) throw errors.forbidden('Invalid media key.')

    const expiresIn = 3600
    const url = await app.s3.getPresignedUrl(key, expiresIn)
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }
  })
}
