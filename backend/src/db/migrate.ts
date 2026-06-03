import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required to run migrations')
  process.exit(1)
}

const sql = neon(url)
const db = drizzle(sql)

async function main() {
  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('Migrations complete.')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
