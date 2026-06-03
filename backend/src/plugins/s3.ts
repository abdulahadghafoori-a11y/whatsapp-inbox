import fp from 'fastify-plugin'
import { config } from '../config.js'
import { S3Service } from '../services/s3.js'

/** Decorates `app.s3`. Uploads/presigns work without lifecycle setup. */
export const s3Plugin = fp(async (app) => {
  const s3 = new S3Service()
  app.decorate('s3', s3)

  if (config.S3_ENSURE_LIFECYCLE) {
    void s3.ensureLifecycleRule(app.log).catch((err) => {
      app.log.warn({ err }, 'Failed to ensure S3 lifecycle rule (non-fatal)')
    })
  }
})
