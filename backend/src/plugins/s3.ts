import fp from 'fastify-plugin'
import { config } from '../config.js'
import { ObjectStorageService } from '../services/object-storage.js'

/** Decorates `app.s3` (ObjectStorageService). Uploads/presigns work without lifecycle setup. */
export const s3Plugin = fp(async (app) => {
  const s3 = new ObjectStorageService()
  app.decorate('s3', s3)

  if (config.S3_ENSURE_LIFECYCLE) {
    void s3.ensureLifecycleRule(app.log).catch((err) => {
      app.log.warn({ err }, 'Failed to ensure lifecycle rule (non-fatal)')
    })
  }
})
