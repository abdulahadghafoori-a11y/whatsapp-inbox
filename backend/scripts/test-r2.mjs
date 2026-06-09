import 'dotenv/config'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

const client = new S3Client({
  region: process.env.STORAGE_REGION || 'auto',
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
})
const bucket = process.env.STORAGE_BUCKET_NAME
const testKey = process.argv[2] || 'media/_healthcheck/test.txt'

try {
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: testKey }))
  console.log('HEAD OK:', testKey)
} catch (e) {
  console.log('HEAD miss:', testKey, e.name, e.$metadata?.httpStatusCode)
  if (testKey.includes('_healthcheck')) {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: testKey, Body: 'ok', ContentType: 'text/plain' }),
    )
    console.log('Uploaded healthcheck object')
  }
}

const presigned = await getSignedUrl(
  client,
  new GetObjectCommand({ Bucket: bucket, Key: testKey }),
  { expiresIn: 60 },
)
const res = await fetch(presigned)
console.log('Presigned fetch:', res.status, res.statusText)
