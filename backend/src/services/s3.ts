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
import { config } from '../config.js'

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

export class S3Service {
  private client: S3Client
  private bucket: string

  constructor() {
    this.client = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
      maxAttempts: 2,
    })
    this.bucket = config.S3_BUCKET_NAME
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return true
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey') return false
      return false
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

  /** Upload only when the object is not already stored (content-addressed keys). */
  async uploadToS3IfMissing(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (await this.objectExists(key)) return key
    return this.uploadToS3(key, buffer, mimeType)
  }

  async downloadFromS3(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    const body = res.Body
    if (!body) throw new Error(`S3 object empty: ${key}`)
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

  /**
   * Idempotent: ensures the 30-day media lifecycle rule exists.
   * Run once on startup, safe to re-run (we only write when the rule is missing).
   */
  async ensureLifecycleRule(log?: FastifyBaseLogger): Promise<void> {
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
      // NoSuchLifecycleConfiguration is expected on a fresh bucket — fall through.
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

export function buildMediaKey(
  conversationId: string,
  messageId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `media/${conversationId}/${messageId}/${safe}`
}
