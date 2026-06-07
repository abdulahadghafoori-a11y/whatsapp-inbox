import 'dotenv/config'
import { z } from 'zod'

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Was min(16) — production requires 64+ random chars (enforced after parse).
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CORS_ORIGINS: z.string().default('*'),

  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),

  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  /** Cloudflare R2 or AWS S3 — prefer STORAGE_*; AWS_* kept for backward compatibility. */
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_BUCKET_NAME: z.string().min(1).optional(),
  STORAGE_REGION: z.string().optional(),

  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_REGION: z.string().default('ap-south-1'),
  S3_BUCKET_NAME: z.string().min(1).optional(),
  // Set true to apply the 30-day media/ lifecycle rule on startup (AWS S3 only).
  S3_ENSURE_LIFECYCLE: booleanish,

  /** Shared secret for worker → API internal socket-emit bridge. */
  WORKER_INTERNAL_SECRET: z.string().min(16).default('dev-worker-internal-secret'),
  /** Base URL the worker uses to reach the API (e.g. http://127.0.0.1:3001). */
  API_INTERNAL_URL: z.string().url().default('http://127.0.0.1:3001'),
  WORKER_PORT: z.coerce.number().int().positive().default(3002),
  DEFAULT_ORGANIZATION_ID: z.string().uuid().optional(),

  ANTHROPIC_API_KEY: z.string().min(1),
  /** When false, conversations are never auto-assigned to AI and ai_agent_reply jobs are skipped. */
  AI_AGENT_ENABLED: booleanish,
  AI_ROUTING_FRACTION: z.coerce.number().min(0).max(1).default(0.1),

  /** Optional Sentry DSN for error tracking. When unset, Sentry stays disabled. */
  SENTRY_DSN: z.string().optional(),

  // Dev only: accept POST /api/webhook/whatsapp without x-hub-signature-256 (e.g. Chakra relay).
  // Must stay false in production — Meta always sends the signature header.
  WEBHOOK_SKIP_SIGNATURE: booleanish,

  // Allow skipping external integration validation during local typecheck/tests.
  SKIP_ENV_VALIDATION: booleanish,

  /**
   * Optional public CDN origin for media (e.g. https://cdn.example.com).
   * When set, GET /api/media presigned URLs are rewritten for lower latency.
   * Bucket must allow the CDN to fetch from S3/R2.
   */
  STORAGE_CDN_PUBLIC_BASE: z.string().url().optional(),

  /** Comma-separated DNS servers for WhatsApp media CDN (lookaside.fbsbx.com). */
  WHATSAPP_MEDIA_DNS_SERVERS: z
    .string()
    .default('8.8.8.8,1.1.1.1')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
})

export type AppConfig = z.infer<typeof envSchema>

function loadConfig(): AppConfig {
  // When running tests/typecheck without real secrets, relax required fields.
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return {
      NODE_ENV: (process.env.NODE_ENV as AppConfig['NODE_ENV']) ?? 'test',
      PORT: Number(process.env.PORT ?? 3001),
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-test-secret',
      CORS_ORIGINS: process.env.CORS_ORIGINS ?? '*',
      WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN ?? 'test',
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'test',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'test',
      WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? 'test',
      WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET ?? 'test',
      // neon() requires user:pass@host/dbname (see @neondatabase/serverless).
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://ci:ci@localhost:5432/test',
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
      STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
      STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
      STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
      STORAGE_BUCKET_NAME: process.env.STORAGE_BUCKET_NAME,
      STORAGE_REGION: process.env.STORAGE_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      AWS_REGION: process.env.AWS_REGION ?? 'ap-south-1',
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? 'test',
      S3_ENSURE_LIFECYCLE: process.env.S3_ENSURE_LIFECYCLE === 'true',
      WORKER_INTERNAL_SECRET: process.env.WORKER_INTERNAL_SECRET ?? 'dev-worker-internal-secret',
      API_INTERNAL_URL: process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
      WORKER_PORT: Number(process.env.WORKER_PORT ?? 3002),
      DEFAULT_ORGANIZATION_ID: process.env.DEFAULT_ORGANIZATION_ID,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? 'test',
      AI_AGENT_ENABLED: process.env.AI_AGENT_ENABLED === 'true' || process.env.AI_AGENT_ENABLED === '1',
      AI_ROUTING_FRACTION: Number(process.env.AI_ROUTING_FRACTION ?? 0.1),
      SENTRY_DSN: process.env.SENTRY_DSN,
      WEBHOOK_SKIP_SIGNATURE: process.env.WEBHOOK_SKIP_SIGNATURE === 'true',
      SKIP_ENV_VALIDATION: true,
      WHATSAPP_MEDIA_DNS_SERVERS: ['8.8.8.8', '1.1.1.1'],
    }
  }

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    // Fail fast and loud — do not start with a half-configured server.
    console.error(`\nInvalid environment configuration:\n${issues}\n`)
    process.exit(1)
  }
  const data = parsed.data
  if (data.WEBHOOK_SKIP_SIGNATURE && data.NODE_ENV === 'production') {
    console.error('\nWEBHOOK_SKIP_SIGNATURE cannot be enabled in production.\n')
    process.exit(1)
  }
  // Was: CORS_ORIGINS=* allowed in production — unsafe for credentialed browser clients.
  if (data.NODE_ENV === 'production' && data.CORS_ORIGINS.trim() === '*') {
    console.error('\nCORS_ORIGINS cannot be "*" in production. Set explicit origins.\n')
    process.exit(1)
  }
  if (data.NODE_ENV === 'production' && data.JWT_SECRET.length < 64) {
    console.error('\nJWT_SECRET must be at least 64 characters in production.\n')
    process.exit(1)
  }
  requireStorageFields(data)
  return data
}

export const config = loadConfig()

export const isProd = config.NODE_ENV === 'production'

export function corsOrigins(): string | string[] | boolean {
  if (!isProd) return true // reflect request origin in dev
  if (config.CORS_ORIGINS === '*') return '*'
  return config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
}

export type StorageProviderConfig = {
  provider: 'r2' | 's3'
  endpoint: string | undefined
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/** Resolved object storage credentials (R2 when STORAGE_ENDPOINT is set). */
export function storageConfig(): StorageProviderConfig {
  const accessKeyId =
    config.STORAGE_ACCESS_KEY_ID ?? config.AWS_ACCESS_KEY_ID ?? ''
  const secretAccessKey =
    config.STORAGE_SECRET_ACCESS_KEY ?? config.AWS_SECRET_ACCESS_KEY ?? ''
  const bucket = config.STORAGE_BUCKET_NAME ?? config.S3_BUCKET_NAME ?? ''
  const endpoint = config.STORAGE_ENDPOINT
  const isR2 = !!endpoint

  return {
    provider: isR2 ? 'r2' : 's3',
    endpoint,
    region: isR2 ? (config.STORAGE_REGION ?? 'auto') : config.AWS_REGION,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: isR2,
  }
}

function requireStorageFields(data: AppConfig): void {
  const accessKeyId = data.STORAGE_ACCESS_KEY_ID ?? data.AWS_ACCESS_KEY_ID
  const secretAccessKey = data.STORAGE_SECRET_ACCESS_KEY ?? data.AWS_SECRET_ACCESS_KEY
  const bucket = data.STORAGE_BUCKET_NAME ?? data.S3_BUCKET_NAME
  if (!accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      '\nStorage config incomplete: set STORAGE_* (R2) or AWS_* + S3_BUCKET_NAME.\n',
    )
    process.exit(1)
  }
}
