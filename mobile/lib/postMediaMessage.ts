import axios from 'axios'
import * as FileSystem from 'expo-file-system/legacy'
import { api, ensureAccessTokenFresh } from '@/services/api'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { normalizeUploadMime } from '@/lib/mediaMime'
import { prepareImageForSend } from '@/lib/prepareImageSend'
import { prepareStickerForSend } from '@/lib/prepareStickerForSend'
import { assertMediaUploadable, prepareMediaFileForUpload } from '@/lib/prepareUpload'
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
  if (!cacheKey) return payload
  const contentHash = await hashPreparedFile(payload.fileUri)
  await putPreparedInCache(cacheKey, payload, contentHash)
  return payload
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
    const { prepareVoiceForSend } = await import('@/lib/prepareVoiceForSend')
    const voice = await prepareVoiceForSend(input.uri, input.name, mimeHint)
    return { fileUri: voice.uri, fileName: voice.name, mimeType: 'audio/ogg' }
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
    mimeHintForAudio?: boolean
    audioBase64?: string
    audioFileName?: string
    onPhase?: (phase: MediaSendPhase) => void
    onUploadProgress?: (progress: number) => void
  },
): Promise<Message> {
  meta.onPhase?.('uploading')
  await ensureAccessTokenFresh()

  if (meta.mimeHintForAudio && meta.audioBase64) {
    const res = await api.post<{ message: Message }>(
      `/conversations/${conversationId}/messages`,
      {
        type: 'audio' as const,
        filename: meta.audioFileName ?? 'voice.ogg',
        mimeType: 'audio/ogg',
        data: meta.audioBase64,
        ...(meta.caption ? { caption: meta.caption } : {}),
        ...(meta.replyToMessageId ? { replyToMessageId: meta.replyToMessageId } : {}),
      },
      { timeout: 120_000 },
    )
    meta.onPhase?.('sending')
    return normalizeMessage(res.data.message as Message & Record<string, unknown>)
  }

  const contentHash = await hashPreparedFile(prepared.fileUri)
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
    if (axios.isAxiosError(err) && err.response?.status === 401) {
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
    const prepared = await prepareMediaPayload(input)
    const data = await FileSystem.readAsStringAsync(prepared.fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    if (!data || data.length < 280) {
      throw new Error('Recording could not be read. Please try again.')
    }
    return postPreparedMedia(conversationId, prepared, {
      caption: input.caption,
      replyToMessageId: input.replyToMessageId,
      mimeHintForAudio: true,
      audioBase64: data,
      audioFileName: prepared.fileName,
      onPhase: input.onPhase,
    })
  }

  const prepared = await prepareMediaPayload(input)
  input.onPrepared?.(prepared)
  return postPreparedMedia(conversationId, prepared, {
    caption: input.caption,
    replyToMessageId: input.replyToMessageId,
    onPhase: input.onPhase,
    onUploadProgress: input.onUploadProgress,
  })
}
