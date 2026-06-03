import { request } from 'undici'
import FormData from 'form-data'
import type { FastifyBaseLogger } from 'fastify'
import { config } from '../config.js'
import { fetchWhatsAppCdn } from '../utils/media-dns.js'
import { withRetry } from '../utils/retry.js'
import { errors } from '../utils/errors.js'

const BASE = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}`
const PHONE = config.WHATSAPP_PHONE_NUMBER_ID

interface WaSendResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

class WhatsAppApiError extends Error {
  status: number
  retryAfterMs?: number
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.name = 'WhatsAppApiError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

/** Retry 429 + 5xx, honoring Retry-After when present. */
function isRetryable(err: unknown): boolean {
  if (err instanceof WhatsAppApiError) {
    return err.status === 429 || err.status >= 500
  }
  return true // network errors
}

async function call<T>(
  log: FastifyBaseLogger,
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE}${endpoint}`
  return withRetry(
    async () => {
      const started = Date.now()
      const res = await request(url, {
        method,
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })
      const duration = Date.now() - started
      const text = await res.body.text()
      const status = res.statusCode

      log.info({ method, endpoint, status, duration }, 'whatsapp_api_call')

      if (status >= 200 && status < 300) {
        return (text ? JSON.parse(text) : {}) as T
      }

      let message = `WhatsApp API ${status}`
      try {
        const parsed = JSON.parse(text) as WaSendResponse
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        /* keep default */
      }
      const retryAfter = res.headers['retry-after']
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
      throw new WhatsAppApiError(message, status, retryAfterMs)
    },
    {
      attempts: 3,
      shouldRetry: isRetryable,
      onRetry: (err, attempt, delay) =>
        log.warn(
          { endpoint, attempt, delay, err: (err as Error).message },
          'whatsapp_api_retry',
        ),
    },
  ).catch((err) => {
    throw errors.whatsappApi((err as Error).message)
  })
}

export interface WhatsAppService {
  sendTextMessage(
    log: FastifyBaseLogger,
    to: string,
    body: string,
    opts?: { replyToWaMessageId?: string },
  ): Promise<{ message_id: string }>
  deleteMessage(log: FastifyBaseLogger, waMessageId: string): Promise<void>
  sendMediaMessage(
    log: FastifyBaseLogger,
    to: string,
    type: string,
    mediaId: string,
    caption?: string,
    opts?: { voice?: boolean },
  ): Promise<{ message_id: string }>
  sendTemplateMessage(
    log: FastifyBaseLogger,
    to: string,
    templateName: string,
    languageCode: string,
    components?: unknown[],
  ): Promise<{ message_id: string }>
  uploadMedia(
    log: FastifyBaseLogger,
    buffer: Buffer,
    mimeType: string,
    filename?: string,
  ): Promise<{ id: string }>
  getMediaUrl(log: FastifyBaseLogger, mediaId: string): Promise<string>
  downloadMedia(log: FastifyBaseLogger, url: string): Promise<Buffer>
  markAsRead(log: FastifyBaseLogger, messageId: string): Promise<void>
  listTemplates(log: FastifyBaseLogger): Promise<unknown[]>
}

export const whatsapp: WhatsAppService = {
  async sendTextMessage(log, to, body, opts) {
    const res = await call<WaSendResponse>(log, 'POST', `/${PHONE}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: true },
      ...(opts?.replyToWaMessageId
        ? { context: { message_id: opts.replyToWaMessageId } }
        : {}),
    })
    return { message_id: res.messages?.[0]?.id ?? '' }
  },

  async deleteMessage(log, waMessageId) {
    await call(log, 'DELETE', `/${PHONE}/messages?message_id=${encodeURIComponent(waMessageId)}`)
  },

  async sendMediaMessage(log, to, type, mediaId, caption, opts) {
    const media: Record<string, unknown> = { id: mediaId }
    if (type === 'audio' && opts?.voice) {
      media.voice = true
    }
    if (caption && (type === 'image' || type === 'video' || type === 'document')) {
      media.caption = caption
    }
    const res = await call<WaSendResponse>(log, 'POST', `/${PHONE}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: media,
    })
    return { message_id: res.messages?.[0]?.id ?? '' }
  },

  async sendTemplateMessage(log, to, templateName, languageCode, components) {
    const res = await call<WaSendResponse>(log, 'POST', `/${PHONE}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    })
    return { message_id: res.messages?.[0]?.id ?? '' }
  },

  async uploadMedia(log, buffer, mimeType, filename = 'upload') {
    const waMime = mimeType.split(';')[0].trim()
    const ext =
      {
        'audio/aac': 'm4a',
        'audio/mp4': 'm4a',
        'audio/amr': 'amr',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'application/pdf': 'pdf',
      }[waMime] ?? 'bin'
    const safeName = filename.includes('.') ? filename : `${filename}.${ext}`

    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', waMime)
    form.append('file', buffer, {
      filename: safeName,
      contentType: waMime,
      knownLength: buffer.length,
    })

    const res = await request(`${BASE}/${PHONE}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form,
    })
    const text = await res.body.text()
    if (res.statusCode < 200 || res.statusCode >= 300) {
      log.error({ status: res.statusCode, text }, 'whatsapp_media_upload_failed')
      throw errors.whatsappApi(`Media upload failed (${res.statusCode})`)
    }
    return JSON.parse(text) as { id: string }
  },

  async getMediaUrl(log, mediaId) {
    const res = await call<{ url: string }>(log, 'GET', `/${mediaId}`)
    return res.url
  },

  async downloadMedia(log, url) {
    const host = new URL(url).hostname
    const auth = `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`
    return withRetry(
      async () => fetchWhatsAppCdn(url, auth),
      {
        attempts: 3,
        shouldRetry: isRetryable,
        onRetry: (err, attempt, delay) =>
          log.warn(
            { host, attempt, delay, err: (err as Error).message },
            'whatsapp_media_download_retry',
          ),
      },
    ).catch((err) => {
      const msg = (err as Error).message
      if (msg.includes('ENOENT') || msg.includes('ENOTFOUND') || msg.includes('No A record')) {
        log.error(
          { host, dns: config.WHATSAPP_MEDIA_DNS_SERVERS },
          'whatsapp_media_dns_failed — LAN DNS may block Meta CDN; using public DNS/DoH',
        )
      }
      throw errors.whatsappApi(
        `Media download failed for ${host}: ${msg}. If this persists, check firewall/DNS or set WHATSAPP_MEDIA_DNS_SERVERS=8.8.8.8,1.1.1.1`,
      )
    })
  },

  async markAsRead(log, messageId) {
    await call(log, 'POST', `/${PHONE}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    })
  },

  async listTemplates(log) {
    const res = await call<{ data?: unknown[] }>(
      log,
      'GET',
      `/${config.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=100`,
    )
    return res.data ?? []
  },
}
