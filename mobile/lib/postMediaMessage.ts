import axios from 'axios'
import { getApiErrorCode } from '@/services/api'
import * as FileSystem from 'expo-file-system/legacy'
import { api, ensureAccessTokenFresh } from '@/services/api'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { normalizeUploadMime } from '@/lib/mediaMime'
import { prepareImageForSend } from '@/lib/prepareImageSend'
import { assertVoiceFileReady, prepareVoiceForSend } from '@/lib/prepareVoiceForSend'
import { prepareStickerForSend } from '@/lib/prepareStickerForSend'
import { prepareMediaFileForUpload } from '@/lib/prepareUpload'
import { assertMediaUploadable } from '@/lib/waMediaLimits'
import { hashPreparedFile } from '@/lib/mediaContentHash'
import {
  getS3KeyForContentHash,
  rememberContentHashS3Key,
} from '@/lib/messageMediaCache'
import {
  buildPrepareCacheKey,
  getPreparedFromCache,
  putPreparedInCache,
  type PrepareCacheOptions,
} from '@/lib/preparedMediaCache'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import type { Message } from '@/types'
import type { MediaSendPhase } from '@/lib/mediaSendPhase'

export type PreparedMediaPayload = {
  fileUri: string
  fileName: string
  mimeType: string
  /** SHA-256 of the prepared bytes; hashed once during prep, reused for S3 dedupe. */
  contentHash?: string | null
}

export type MediaPostInput = {
  uri: string
  name: string
  mimeType: string
  caption?: string
  imageQuality?: MediaQualityTier
  videoQuality?: MediaQualityTier
  replyToMessageId?: string
  videoTrim?: { startMs: number; endMs: number }
  sendAsDocument?: boolean
  /** Skip trim/compress — file is already prepared for upload. */
  skipPrepare?: boolean
  onPhase?: (phase: MediaSendPhase) => void
  onCompressProgress?: (progress: number) => void
  onUploadProgress?: (progress: number) => void
  onPrepared?: (prepared: PreparedMediaPayload) => void
}

function prepareCacheOpts(input: MediaPostInput, mimeHint: string): PrepareCacheOptions {
  return {
    mimeType: mimeHint,
    videoTrim: input.videoTrim,
    videoQuality: input.videoQuality,
    imageQuality: input.imageQuality,
    sendAsDocument: input.sendAsDocument,
  }
}

async function storePreparedInCache(
  cacheKey: string | null,
  payload: PreparedMediaPayload,
): Promise<PreparedMediaPayload> {
  // Hash the prepared bytes exactly once here and carry it on the payload so the
  // upload step can reuse it for S3 dedupe instead of re-reading the whole file.
  const contentHash = await hashPreparedFile(payload.fileUri)
  if (cacheKey) await putPreparedInCache(cacheKey, payload, contentHash)
  return { ...payload, contentHash }
}

async function tryReuseByPreparedCache(
  conversationId: string,
  input: MediaPostInput & { caption?: string; replyToMessageId?: string },
): Promise<Message | null> {
  const mimeHint = normalizeUploadMime(input.mimeType, input.name)
  if (mimeHint.startsWith('audio/') || input.skipPrepare) return null

  const cacheKey = await buildPrepareCacheKey(input.uri, prepareCacheOpts(input, mimeHint))
  if (!cacheKey) return null

  const cached = await getPreparedFromCache(cacheKey)
  if (!cached?.contentHash) return null

  const reuseS3Key = await getS3KeyForContentHash(cached.contentHash)
  if (!reuseS3Key) return null

  input.onPhase?.('sending')
  return postPreparedMedia(conversationId, cached, {
    caption: input.caption,
    replyToMessageId: input.replyToMessageId,
    asDocument: input.sendAsDocument,
    onPhase: input.onPhase,
    onUploadProgress: input.onUploadProgress,
  })
}

export async function prepareMediaPayload(input: MediaPostInput): Promise<PreparedMediaPayload> {
  const mimeHint = normalizeUploadMime(input.mimeType, input.name)
  if (input.skipPrepare) {
    return {
      fileUri: input.uri,
      fileName: input.name,
      mimeType: input.sendAsDocument
        ? 'application/octet-stream'
        : mimeHint.startsWith('video/')
          ? 'video/mp4'
          : mimeHint,
    }
  }

  const cacheOpts = prepareCacheOpts(input, mimeHint)
  const cacheKey =
    mimeHint.startsWith('audio/') ? null : await buildPrepareCacheKey(input.uri, cacheOpts)
  if (cacheKey) {
    const cached = await getPreparedFromCache(cacheKey)
    if (cached) return cached
  }

  input.onPhase?.('preparing')

  if (mimeHint.startsWith('audio/')) {
    // contentHash: null → skip S3 dedupe for voice (would require another full-file
    // read); voice notes are unique per recording so dedupe has no real payoff.
    if (input.skipPrepare) {
      await assertVoiceFileReady(input.uri)
      return { fileUri: input.uri, fileName: input.name, mimeType: 'audio/ogg', contentHash: null }
    }
    const voice = await prepareVoiceForSend(input.uri, input.name, mimeHint)
    return { fileUri: voice.uri, fileName: voice.name, mimeType: 'audio/ogg', contentHash: null }
  }

  if (input.sendAsDocument) {
    await assertMediaUploadable(input.uri, mimeHint, input.name)
    const prepared = await prepareMediaFileForUpload(input.uri, input.name, input.mimeType)
    const docName = prepared.name.includes('.') ? prepared.name : `${prepared.name}.mp4`
    return storePreparedInCache(cacheKey, {
      fileUri: prepared.uri,
      fileName: docName,
      mimeType: 'application/octet-stream',
    })
  }

  if (mimeHint === 'image/webp') {
    const sticker = await prepareStickerForSend(input.uri, input.name)
    return storePreparedInCache(cacheKey, {
      fileUri: sticker.uri,
      fileName: sticker.name,
      mimeType: sticker.mimeType,
    })
  }

  if (mimeHint.startsWith('image/')) {
    const img = await prepareImageForSend(input.uri, input.imageQuality ?? 'hd')
    return storePreparedInCache(cacheKey, {
      fileUri: img.uri,
      fileName: img.name,
      mimeType: img.mimeType,
    })
  }

  if (mimeHint.startsWith('video/')) {
    const { prepareVideoForSend } = await import('@/lib/prepareVideoForSend')
    const vid = await prepareVideoForSend(input.uri, input.name, {
      ...input.videoTrim,
      videoQuality: input.videoQuality ?? 'hd',
      onProgress: input.onCompressProgress,
    })
    return storePreparedInCache(cacheKey, {
      fileUri: vid.uri,
      fileName: vid.name,
      mimeType: vid.mimeType,
    })
  }

  await assertMediaUploadable(input.uri, mimeHint, input.name)
  const prepared = await prepareMediaFileForUpload(input.uri, input.name, input.mimeType)
  return storePreparedInCache(cacheKey, {
    fileUri: prepared.uri,
    fileName: prepared.name,
    mimeType: normalizeUploadMime(prepared.mimeType, prepared.name),
  })
}

export async function postPreparedMedia(
  conversationId: string,
  prepared: PreparedMediaPayload,
  meta: {
    caption?: string
    replyToMessageId?: string
    asDocument?: boolean
    onPhase?: (phase: MediaSendPhase) => void
    onUploadProgress?: (progress: number) => void
  },
): Promise<Message> {
  meta.onPhase?.('uploading')
  await ensureAccessTokenFresh()

  const contentHash =
    prepared.contentHash !== undefined
      ? prepared.contentHash
      : await hashPreparedFile(prepared.fileUri)
  if (contentHash) {
    const reuseS3Key = await getS3KeyForContentHash(contentHash)
    if (reuseS3Key) {
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages`,
        {
          type: 'media_reuse' as const,
          reuseS3Key,
          filename: prepared.fileName,
          mimeType: prepared.mimeType,
          ...(meta.asDocument ? { asDocument: true } : {}),
          ...(meta.caption ? { caption: meta.caption } : {}),
          ...(meta.replyToMessageId ? { replyToMessageId: meta.replyToMessageId } : {}),
        },
        { timeout: 120_000 },
      )
      const message = normalizeMessage(res.data.message as Message & Record<string, unknown>)
      if (message.mediaUrl) {
        await rememberContentHashS3Key(contentHash, message.mediaUrl)
      }
      meta.onPhase?.('sending')
      return message
    }
  }

  const uploadTimeout = prepared.mimeType.startsWith('video/') ? 300_000 : 180_000
  const buildForm = () => {
    const form = new FormData()
    form.append('file', {
      uri: prepared.fileUri,
      name: prepared.fileName,
      type: prepared.mimeType,
    } as unknown as Blob)
    if (meta.caption) form.append('caption', meta.caption)
    if (meta.replyToMessageId) form.append('replyToMessageId', meta.replyToMessageId)
    if (meta.asDocument) form.append('asDocument', 'true')
    return form
  }

  let res: { data: { message: Message } }
  try {
    res = await api.post<{ message: Message }>(
      `/conversations/${conversationId}/messages`,
      buildForm(),
      {
        timeout: uploadTimeout,
        onUploadProgress: meta.onUploadProgress
          ? (evt) => {
              const total = evt.total ?? 0
              if (total > 0) {
                meta.onUploadProgress!(Math.min(1, evt.loaded / total))
              }
            }
          : undefined,
      },
    )
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 401 &&
      getApiErrorCode(err) !== 'TOKEN_REVOKED'
    ) {
      await ensureAccessTokenFresh()
      res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages`,
        buildForm(),
        {
          timeout: uploadTimeout,
          onUploadProgress: meta.onUploadProgress
            ? (evt) => {
                const total = evt.total ?? 0
                if (total > 0) {
                  meta.onUploadProgress!(Math.min(1, evt.loaded / total))
                }
              }
            : undefined,
        },
      )
    } else {
      throw err
    }
  }

  const message = normalizeMessage(res.data.message as Message & Record<string, unknown>)
  if (contentHash && message.mediaUrl) {
    await rememberContentHashS3Key(contentHash, message.mediaUrl)
  }
  meta.onPhase?.('sending')
  return message
}

export async function postMediaMessage(
  conversationId: string,
  input: MediaPostInput & { caption?: string; replyToMessageId?: string },
): Promise<Message> {
  const mimeHint = normalizeUploadMime(input.mimeType, input.name)

  if (mimeHint.startsWith('audio/')) {
    input.onPhase?.('preparing')
    const prepared = await prepareMediaPayload(input)
    // Was: read the whole OGG as base64 and POST it in JSON (~22MB string on the
    // JS thread → jank/OOM on long notes). Now upload as multipart like all media.
    const info = await FileSystem.getInfoAsync(prepared.fileUri)
    if (!info.exists || (typeof info.size === 'number' && info.size < 200)) {
      throw new Error('Recording could not be read. Please try again.')
    }
    input.onPhase?.('uploading')
    return postPreparedMedia(conversationId, prepared, {
      caption: input.caption,
      replyToMessageId: input.replyToMessageId,
      onPhase: input.onPhase,
      onUploadProgress: input.onUploadProgress,
    })
  }

  const reused = await tryReuseByPreparedCache(conversationId, input)
  if (reused) return reused

  const prepared = await prepareMediaPayload(input)
  input.onPrepared?.(prepared)
  return postPreparedMedia(conversationId, prepared, {
    caption: input.caption,
    replyToMessageId: input.replyToMessageId,
    asDocument: input.sendAsDocument,
    onPhase: input.onPhase,
    onUploadProgress: input.onUploadProgress,
  })
}
