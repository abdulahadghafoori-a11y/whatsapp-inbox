import { db } from '../db/index.js'
import { jobs } from '../db/schema.js'

export type JobType =
  | 'send_whatsapp_message'
  | 'download_media'
  | 'send_push_notification'
  | 'ai_agent_reply'

export interface JobPayloads {
  send_whatsapp_message: {
    to: string
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker'
    conversationId: string
    messageId: string // local message row to update with wa id / status
    body?: string
    mediaId?: string
    caption?: string
    replyToWaMessageId?: string
    voiceNote?: boolean
  }
  download_media: {
    messageId: string
    conversationId: string
    waMediaId: string
    mimeType: string
    filename: string
  }
  send_push_notification: {
    agentId: string
    title: string
    body: string
    data?: Record<string, unknown>
  }
  ai_agent_reply: {
    conversationId: string
    agentId: string
  }
}

export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  opts: { maxAttempts?: number } = {},
): Promise<string> {
  const [row] = await db
    .insert(jobs)
    .values({
      type,
      payload: payload as unknown as Record<string, unknown>,
      maxAttempts: opts.maxAttempts ?? 3,
    })
    .returning({ id: jobs.id })
  return row.id
}
