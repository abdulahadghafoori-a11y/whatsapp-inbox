import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import type { Message } from '@/types'

export type ClientMediaSendMeta = {
  videoTrim?: { startMs: number; endMs: number }
  sendAsDocument?: boolean
  imageQuality?: MediaQualityTier
  videoQuality?: MediaQualityTier
  sourceUri?: string
  /** After device prepare — retry upload without re-trimming. */
  preparedUri?: string
}

export function readClientSendMeta(message: Message): ClientMediaSendMeta | undefined {
  const meta = message.metadata
  if (!meta || typeof meta !== 'object') return undefined
  const cs = (meta as Record<string, unknown>).clientSend
  if (!cs || typeof cs !== 'object') return undefined
  return cs as ClientMediaSendMeta
}

export function clientSendMetadata(
  media: {
    uri: string
    videoTrim?: { startMs: number; endMs: number }
    sendAsDocument?: boolean
    imageQuality?: MediaQualityTier
    videoQuality?: MediaQualityTier
    preparedUri?: string
  },
  clientMessageId?: string,
): Record<string, unknown> {
  return {
    ...(clientMessageId ? { clientMessageId } : {}),
    clientSend: {
      sourceUri: media.uri,
      videoTrim: media.videoTrim,
      sendAsDocument: media.sendAsDocument,
      imageQuality: media.imageQuality,
      videoQuality: media.videoQuality,
      preparedUri: media.preparedUri,
    } satisfies ClientMediaSendMeta,
  }
}
