import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { config } from '../config.js'
import * as schema from './schema.js'

// Neon's serverless driver speaks WebSockets, which (unlike the stateless HTTP
// driver) supports interactive transactions AND pooled, reused connections —
// both required for atomic multi-step writes and lower per-query latency.
// Node <22 has no global WebSocket, so provide one explicitly.
neonConfig.webSocketConstructor = ws

export const pool = new Pool({ connectionString: config.DATABASE_URL })

export const db = drizzle(pool, { schema })

export type DB = typeof db

/**
 * Either the root db or an active transaction handle. Pass this to helpers
 * (e.g. enqueueJob) so they participate in the caller's transaction.
 */
export type Executor = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

export { schema }
