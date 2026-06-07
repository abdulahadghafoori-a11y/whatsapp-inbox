import type { FastifyBaseLogger } from 'fastify'
import type { ObjectStorageService } from '../services/object-storage.js'
import type { SocketNotify } from './socket-notify.js'

export type WorkerContext = {
  storage: ObjectStorageService
  log: FastifyBaseLogger
  notify: SocketNotify
}
