import { describe, it, expect, vi, beforeEach } from 'vitest'

const findFirst = vi.fn()
const update = vi.fn()
const insert = vi.fn()
const getMediaInfo = vi.fn()
const downloadMedia = vi.fn()
const uploadToS3IfMissing = vi.fn()
const emitMediaReady = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      messages: { findFirst: (...a: unknown[]) => findFirst(...a) },
      mediaBlobs: { findFirst: vi.fn() },
    },
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
    getMediaInfo: (...a: unknown[]) => getMediaInfo(...a),
    downloadMedia: (...a: unknown[]) => downloadMedia(...a),
  },
}))

vi.mock('./socket-events.js', () => ({
  emitMediaReady: (...a: unknown[]) => emitMediaReady(...a),
}))

vi.mock('./media-blobs.js', () => ({
  registerBlob: vi.fn(),
  getBlobByWaMediaId: vi.fn(),
  getBlobBySha256: vi.fn(),
  getBlobByStorageKey: vi.fn(),
  recordWaMediaId: vi.fn(),
}))

import { getBlobBySha256, getBlobByWaMediaId } from './media-blobs.js'
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

    expect(getMediaInfo).not.toHaveBeenCalled()
    expect(uploadToS3IfMissing).not.toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalledWith(io, 'conv-1', 'msg-1', 'media/blobs/abc.jpg')
  })

  it('reuses storage when wa_media_id was seen before', async () => {
    findFirst.mockResolvedValue({ mediaUrl: null, mediaStatus: 'pending' })
    vi.mocked(getBlobByWaMediaId).mockResolvedValue({
      storageKey: 'media/blobs/reused.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      sha256: 'aa'.repeat(32),
    } as never)

    await processDownloadMedia(s3 as never, io, log, payload)

    expect(getMediaInfo).not.toHaveBeenCalled()
    expect(downloadMedia).not.toHaveBeenCalled()
    expect(uploadToS3IfMissing).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalledWith(
      io,
      'conv-1',
      'msg-1',
      'media/blobs/reused.jpg',
    )
  })

  it('reuses storage when webhook sha256 matches an existing blob', async () => {
    findFirst.mockResolvedValue({ mediaUrl: null, mediaStatus: 'pending' })
    vi.mocked(getBlobByWaMediaId).mockResolvedValue(undefined)
    vi.mocked(getBlobBySha256).mockResolvedValue({
      storageKey: 'media/blobs/hash.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 999,
      sha256: 'bb'.repeat(32),
    } as never)

    await processDownloadMedia(s3 as never, io, log, {
      ...payload,
      waContentSha256: 'bb'.repeat(32),
    })

    expect(getMediaInfo).not.toHaveBeenCalled()
    expect(downloadMedia).not.toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalledWith(io, 'conv-1', 'msg-1', 'media/blobs/hash.jpg')
  })

  it('downloads and uploads when media is still pending', async () => {
    findFirst.mockResolvedValue({ mediaUrl: null, mediaStatus: 'pending' })
    vi.mocked(getBlobByWaMediaId).mockResolvedValue(undefined)
    vi.mocked(getBlobBySha256).mockResolvedValue(undefined)
    getMediaInfo.mockResolvedValue({ url: 'https://cdn.example/file', sha256: undefined })
    downloadMedia.mockResolvedValue(Buffer.from('jpeg-bytes'))
    uploadToS3IfMissing.mockResolvedValue('media/blobs/hash.jpg')

    await processDownloadMedia(s3 as never, io, log, payload)

    expect(getMediaInfo).toHaveBeenCalled()
    expect(downloadMedia).toHaveBeenCalled()
    expect(uploadToS3IfMissing).toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
    expect(emitMediaReady).toHaveBeenCalled()
  })
})
