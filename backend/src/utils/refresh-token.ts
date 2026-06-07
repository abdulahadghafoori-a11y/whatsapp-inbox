import { z } from 'zod'
import { errors } from './errors.js'

const refreshTokenIdSchema = z.string().uuid()

/** Opaque refresh tokens are `<uuid>.<hex-secret>` — split on the first dot only. */
export function parseRefreshToken(raw: string): { id: string; secret: string } {
  const dot = raw.indexOf('.')
  if (dot <= 0 || dot === raw.length - 1) {
    throw errors.unauthorized('Malformed refresh token.')
  }
  const id = raw.slice(0, dot)
  const secret = raw.slice(dot + 1)
  if (!refreshTokenIdSchema.safeParse(id).success || secret.length === 0) {
    throw errors.unauthorized('Malformed refresh token.')
  }
  return { id, secret }
}
