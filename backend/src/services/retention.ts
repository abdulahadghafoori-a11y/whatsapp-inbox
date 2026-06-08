import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import { pruneExpiredLoginAttempts } from '../utils/login-throttle.js'

/** Completed jobs are kept briefly for debugging, then pruned. */
const DONE_JOB_RETENTION_DAYS = 7
/** Failed jobs are kept longer so operators can inspect/replay them. */
const FAILED_JOB_RETENTION_DAYS = 30
/**
 * Delta-feed rows older than this are pruned. A device offline longer than this
 * re-seeds current state from REST on screen open, so it loses nothing.
 */
const CHANGE_LOG_RETENTION_DAYS = 14

const RETENTION_INTERVAL_MS = 60 * 60 * 1000 // hourly
const RETENTION_KICKOFF_MS = 60 * 1000 // ~1 min after boot

/** Prune unbounded operational tables (jobs, change_log, login_attempts). */
export async function runRetention(app: FastifyInstance): Promise<void> {
  try {
    const doneJobs = await db.execute(
      sql`DELETE FROM jobs WHERE status = 'done' AND completed_at < NOW() - (${DONE_JOB_RETENTION_DAYS} * INTERVAL '1 day')`,
    )
    const failedJobs = await db.execute(
      sql`DELETE FROM jobs WHERE status = 'failed' AND updated_at < NOW() - (${FAILED_JOB_RETENTION_DAYS} * INTERVAL '1 day')`,
    )
    const changeLog = await db.execute(
      sql`DELETE FROM change_log WHERE created_at < NOW() - (${CHANGE_LOG_RETENTION_DAYS} * INTERVAL '1 day')`,
    )
    const loginAttempts = await pruneExpiredLoginAttempts()
    app.log.info(
      {
        doneJobs: doneJobs.rowCount ?? 0,
        failedJobs: failedJobs.rowCount ?? 0,
        changeLog: changeLog.rowCount ?? 0,
        loginAttempts,
      },
      'retention sweep complete',
    )
  } catch (err) {
    app.log.error({ err }, 'retention sweep failed')
  }
}

/** Start the periodic retention sweep. Returns a stop function. */
export function startRetentionLoop(app: FastifyInstance): () => void {
  const timer = setInterval(() => void runRetention(app), RETENTION_INTERVAL_MS)
  const kickoff = setTimeout(() => void runRetention(app), RETENTION_KICKOFF_MS)
  return () => {
    clearInterval(timer)
    clearTimeout(kickoff)
  }
}
