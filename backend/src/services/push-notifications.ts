import { request } from 'undici'
import type { FastifyBaseLogger } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamMembers } from '../db/schema.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type ExpoPushTicket = {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

/** Expo push tokens issued to mobile clients. */
export const EXPO_PUSH_TOKEN_RE = /^ExponentPushToken\[[\w-]+\]$/

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

  let parsed: { data?: ExpoPushTicket[] }
  try {
    parsed = JSON.parse(text) as { data?: ExpoPushTicket[] }
  } catch {
    log.warn({ text }, 'expo_push_invalid_json')
    throw new Error('Expo push returned invalid JSON')
  }

  const ticket = parsed.data?.[0]
  if (!ticket) {
    log.warn({ parsed }, 'expo_push_no_ticket')
    throw new Error('Expo push returned no ticket')
  }

  if (ticket.status === 'error') {
    const code = ticket.details?.error
    if (code === 'DeviceNotRegistered') {
      await db
        .update(teamMembers)
        .set({ expoPushToken: null })
        .where(eq(teamMembers.id, args.agentId))
      log.info({ agentId: args.agentId }, 'cleared stale expo push token')
      return
    }
    log.warn({ ticket }, 'expo_push_ticket_error')
    throw new Error(ticket.message ?? 'Expo push ticket error')
  }
}
