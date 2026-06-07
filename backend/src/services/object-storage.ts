import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { FastifyBaseLogger } from 'fastify'
import { storageConfig } from '../config.js'

const LIFECYCLE_RULE_ID = 'delete-media-after-30-days'
const LIFECYCLE_API_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

/** S3-compatible object storage (AWS S3 or Cloudflare R2). */
export class ObjectStorageService {
  private client: S3Client
  private bucket: string
  readonly provider: 'r2' | 's3'

  constructor() {
    const cfg = storageConfig()
    this.provider = cfg.provider
    this.bucket = cfg.bucket
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      maxAttempts: 2,
    })
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return true
    } catch (err) {
      const meta = err as { name?: string; $metadata?: { httpStatusCode?: number } }
      const status = meta.$metadata?.httpStatusCode
      if (meta.name === 'NotFound' || meta.name === 'NoSuchKey' || status === 404) {
        return false
      }
      throw err
    }
  }

  async uploadToS3(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    )
    return key
  }

  async uploadToS3IfMissing(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (await this.objectExists(key)) return key
    return this.uploadToS3(key, buffer, mimeType)
  }

  async downloadFromS3(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    const body = res.Body
    if (!body) throw new Error(`Object empty: ${key}`)
    const chunks: Uint8Array[] = []
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    )
  }

  async deleteFromS3(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  /** AWS S3 only — R2 lifecycle is configured in the Cloudflare dashboard. */
  async ensureLifecycleRule(log?: FastifyBaseLogger): Promise<void> {
    if (this.provider === 'r2') {
      log?.debug('skipping S3 lifecycle API for R2 (configure in Cloudflare dashboard)')
      return
    }
    try {
      const existing = await withTimeout(
        this.client.send(
          new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucket }),
        ),
        LIFECYCLE_API_TIMEOUT_MS,
        'S3 GetBucketLifecycleConfiguration',
      )
      const hasRule = existing.Rules?.some((r) => r.ID === LIFECYCLE_RULE_ID)
      if (hasRule) {
        log?.debug('S3 lifecycle rule already present')
        return
      }
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name && name !== 'NoSuchLifecycleConfiguration') {
        log?.warn({ err }, 'Could not read S3 lifecycle config; attempting to set it')
      }
    }

    await withTimeout(
      this.client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: LIFECYCLE_RULE_ID,
                Status: 'Enabled',
                Filter: { Prefix: 'media/' },
                Expiration: { Days: 30 },
              },
            ],
          },
        }),
      ),
      LIFECYCLE_API_TIMEOUT_MS,
      'S3 PutBucketLifecycleConfiguration',
    )
    log?.info('S3 media lifecycle rule ensured (30-day expiry on media/)')
  }
}

/** @deprecated Use ObjectStorageService */
export { ObjectStorageService as S3Service }

export function buildMediaKey(
  conversationId: string,
  messageId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `media/${conversationId}/${messageId}/${safe}`
}

export function buildRawMediaKey(
  conversationId: string,
  messageId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `media/raw/${conversationId}/${messageId}/${safe}`
}
