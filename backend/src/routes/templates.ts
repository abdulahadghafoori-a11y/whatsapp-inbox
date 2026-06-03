import type { FastifyInstance } from 'fastify'
import { whatsapp } from '../services/whatsapp.js'

interface CacheEntry {
  data: unknown[]
  expiresAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
let cache: CacheEntry | null = null

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/templates  (approved WhatsApp message templates, cached 1h)
  app.get('/', async () => {
    if (cache && cache.expiresAt > Date.now()) {
      return { templates: cache.data, cached: true }
    }
    const data = await whatsapp.listTemplates(app.log)
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return { templates: data, cached: false }
  })
}
