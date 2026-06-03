import 'dotenv/config'
import { z } from 'zod'

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

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

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().default('ap-south-1'),
  S3_BUCKET_NAME: z.string().min(1),
  // Set true to apply the 30-day media/ lifecycle rule on startup (needs IAM + network).
  S3_ENSURE_LIFECYCLE: booleanish,

  ANTHROPIC_API_KEY: z.string().min(1),
  AI_ROUTING_FRACTION: z.coerce.number().min(0).max(1).default(0.1),

  // Dev only: accept POST /api/webhook/whatsapp without x-hub-signature-256 (e.g. Chakra relay).
  // Must stay false in production — Meta always sends the signature header.
  WEBHOOK_SKIP_SIGNATURE: booleanish,

  // Allow skipping external integration validation during local typecheck/tests.
  SKIP_ENV_VALIDATION: booleanish,

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
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost:5432/test',
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      AWS_REGION: process.env.AWS_REGION ?? 'ap-south-1',
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? 'test',
      S3_ENSURE_LIFECYCLE: process.env.S3_ENSURE_LIFECYCLE === 'true',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? 'test',
      AI_ROUTING_FRACTION: Number(process.env.AI_ROUTING_FRACTION ?? 0.1),
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
  return data
}

export const config = loadConfig()

export const isProd = config.NODE_ENV === 'production'

export function corsOrigins(): string | string[] | boolean {
  if (!isProd) return true // reflect request origin in dev
  if (config.CORS_ORIGINS === '*') return '*'
  return config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
}
