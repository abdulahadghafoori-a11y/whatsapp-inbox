import type { FastifyBaseLogger } from 'fastify'
import type { ObjectStorageService } from '../services/object-storage.js'
import type { SocketNotify } from './socket-notify.js'

/** Shared deps for future worker extraction (media processor, outbound jobs). */
export type WorkerContext = {
  storage: ObjectStorageService
  log: FastifyBaseLogger
  notify: SocketNotify
}
