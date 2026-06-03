import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { config } from '../config.js'
import * as schema from './schema.js'

const sql = neon(config.DATABASE_URL)

export const db = drizzle(sql, { schema })

export type DB = typeof db
export { schema }
