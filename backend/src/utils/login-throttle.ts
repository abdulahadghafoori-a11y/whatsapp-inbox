import { inArray, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { loginAttempts } from '../db/schema.js'

/**
 * Distributed login throttle backed by Postgres so the limit holds across
 * horizontally-scaled API instances (the previous in-memory map multiplied the
 * effective limit by the number of running processes).
 *
 * Two keys are tracked per attempt:
 *  - `ip:email` — classic brute force from one client (10 / 15 min).
 *  - `acct:email` — credential stuffing of one account from many IPs (20 / 15 min).
 */
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_ATTEMPT_MAX = 10
export const ACCOUNT_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
export const ACCOUNT_ATTEMPT_MAX = 20

/**
 * Atomically increment the counter for `key` within a fixed window and return
 * whether the attempt is still allowed. The single upsert is race-safe across
 * instances (the conflicting row is locked for the CASE update).
 */
export async function registerAttempt(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs)
  const [row] = await db
    .insert(loginAttempts)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN 1 ELSE ${loginAttempts.count} + 1 END`,
        resetAt: sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN ${resetAt} ELSE ${loginAttempts.resetAt} END`,
      },
    })
    .returning({ count: loginAttempts.count })
  return (row?.count ?? 0) <= max
}

/** Register both the per-(ip,email) and per-account counters. Allowed only if both are. */
export async function registerLoginAttempt(ip: string, email: string): Promise<boolean> {
  const [perClient, perAccount] = await Promise.all([
    registerAttempt(`ip:${ip}:${email}`, LOGIN_ATTEMPT_MAX, LOGIN_ATTEMPT_WINDOW_MS),
    registerAttempt(`acct:${email}`, ACCOUNT_ATTEMPT_MAX, ACCOUNT_ATTEMPT_WINDOW_MS),
  ])
  return perClient && perAccount
}

/** Clear counters for a successful login. */
export async function clearLoginAttempts(ip: string, email: string): Promise<void> {
  await db
    .delete(loginAttempts)
    .where(inArray(loginAttempts.key, [`ip:${ip}:${email}`, `acct:${email}`]))
}

/** Periodic cleanup of expired counters (call from the job processor). */
export async function pruneExpiredLoginAttempts(): Promise<number> {
  const deleted = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.resetAt, new Date()))
    .returning({ key: loginAttempts.key })
  return deleted.length
}
