import * as SQLite from 'expo-sqlite'
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite'
import { runMigrations } from './migrations'
import * as schema from './schema'

const DB_NAME = 'wa-inbox.db'

let expoDb: SQLite.SQLiteDatabase | null = null
let drizzleDb: ExpoSQLiteDatabase<typeof schema> | null = null
let readyPromise: Promise<void> | null = null

function openExpoDb(): SQLite.SQLiteDatabase {
  if (!expoDb) {
    // enableChangeListener powers Drizzle's useLiveQuery reactivity.
    expoDb = SQLite.openDatabaseSync(DB_NAME, { enableChangeListener: true })
    expoDb.execSync('PRAGMA journal_mode = WAL;')
    expoDb.execSync('PRAGMA foreign_keys = ON;')
    // Wait up to 10s when live queries read while a write batch is in flight.
    expoDb.execSync('PRAGMA busy_timeout = 10000;')
  }
  return expoDb
}

/** Drizzle handle over the device DB — use for queries and reactive live reads. */
export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (!drizzleDb) {
    drizzleDb = drizzle(openExpoDb(), { schema })
  }
  return drizzleDb
}

/** Raw expo-sqlite handle, for migrations and low-level batch writes. */
export function getRawDb(): SQLite.SQLiteDatabase {
  return openExpoDb()
}

/**
 * Serialize every mutating DB call. expo-sqlite allows only one
 * `withTransactionAsync` at a time; concurrent sync + seed + optimistic sends
 * were tripping "cannot start a transaction within a transaction".
 */
let writeTail: Promise<void> = Promise.resolve()

const SQLITE_BUSY_RE = /database is locked|SQLITE_BUSY|Error code 5/i

async function withBusyRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!SQLITE_BUSY_RE.test(msg) || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 40 * (i + 1)))
    }
  }
  throw last
}

/**
 * Serialize every DB access (reads and writes) on the single expo-sqlite
 * connection. Our reactive reads go through this too, so a live read can never
 * overlap a write batch — which is what produced "database is locked" /
 * "transaction within a transaction" when Drizzle's useLiveQuery prepared
 * statements raced raw writes.
 */
export function runExclusiveDb<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeTail.then(() => withBusyRetry(fn))
  writeTail = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/** @deprecated Use `runExclusiveDb` — kept as an alias for existing call sites. */
export const runExclusiveDbWrite = runExclusiveDb

/** Idempotent: opens the DB and applies pending migrations exactly once per launch. */
export function ensureDbReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = runMigrations(openExpoDb()).catch((err) => {
      readyPromise = null
      throw err
    })
  }
  return readyPromise
}

export { schema }
