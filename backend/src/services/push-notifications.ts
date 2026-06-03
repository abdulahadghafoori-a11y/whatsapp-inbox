import { request } from 'undici'
import type { FastifyBaseLogger } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers } from '../db/schema.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushArgs {
  agentId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Sends an Expo push notification to a single agent. Resolves the token from
 * the DB so callers only need an agentId. No-op when the agent has no token.
 */
export async function sendPushNotification(
  log: FastifyBaseLogger,
  args: PushArgs,
): Promise<void> {
  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, args.agentId),
  })
  const token = member?.expoPushToken
  if (!token) {
    log.debug({ agentId: args.agentId }, 'no expo push token; skipping')
    return
  }

  const res = await request(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      sound: 'default',
      priority: 'high',
    }),
  })

  const text = await res.body.text()
  if (res.statusCode < 200 || res.statusCode >= 300) {
    log.warn({ status: res.statusCode, text }, 'expo_push_failed')
    throw new Error(`Expo push failed (${res.statusCode})`)
  }
}
