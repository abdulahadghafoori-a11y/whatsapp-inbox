import { describe, it, expect, vi, beforeEach } from 'vitest'

const findFirst = vi.fn()
const update = vi.fn()
const insert = vi.fn()
const getMediaUrl = vi.fn()
const downloadMedia = vi.fn()
const uploadToS3IfMissing = vi.fn()
const emitMediaReady = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    query: { messages: { findFirst: (...a: unknown[]) => findFirst(...a) } },
    update: () => ({
      set: () => ({
        where: () => update(),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => insert(),
      }),
    }),
  },
}))

vi.mock('./whatsapp.js', () => ({
  whatsapp: {
    getMediaUrl: (...a: unknown[]) => getMediaUrl(...a),
    downloadMedia: (...a: unknown[]) => downloadMedia(...a),
  },
}))

vi.mock('./socket-events.js', () => ({
  emitMediaReady: (...a: unknown[]) => emitMediaReady(...a),
}))

import { processDownloadMedia } from './media-processor.js'

const s3 = { uploadToS3IfMissing: (...a: unknown[]) => uploadToS3IfMissing(...a) }
const io = {} as never
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

const payload = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  waMediaId: 'wa-media-1',
  mimeType: 'image/jpeg',
  filename: 'photo.jpg',
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue(undefined)
  insert.mockResolvedValue(undefined)
})

describe('processDownloadMedia', () => {
  it('skips WhatsApp download when media is already uploaded', async () => {
    findFirst.mockResolvedValue({
      mediaUrl: 'media/blobs/abc.jpg',
      mediaStatus: 'uploaded',
    })

    await processDownloadMedia(s3 as never, io, log, payload)

    expect(getMediaUrl).not.toHaveBeenCalled()
    expect(uploadToS3IfMissing).not.toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalledWith(io, 'conv-1', 'msg-1', 'media/blobs/abc.jpg')
  })

  it('downloads and uploads when media is still pending', async () => {
    findFirst.mockResolvedValue({ mediaUrl: null, mediaStatus: 'pending' })
    getMediaUrl.mockResolvedValue('https://cdn.example/file')
    downloadMedia.mockResolvedValue(Buffer.from('jpeg-bytes'))
    uploadToS3IfMissing.mockResolvedValue('media/blobs/hash.jpg')

    await processDownloadMedia(s3 as never, io, log, payload)

    expect(getMediaUrl).toHaveBeenCalled()
    expect(uploadToS3IfMissing).toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalled()
  })
})
