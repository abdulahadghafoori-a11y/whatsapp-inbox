import { useSyncExternalStore } from 'react'
import {
  isMessageMediaDownloading,
  subscribeMessageMediaDownload,
} from '@/lib/messageMediaSync'

export function useMediaDownloadState(messageId: string | undefined): boolean {
  return useSyncExternalStore(
    (cb) => subscribeMessageMediaDownload(messageId, cb),
    () => (messageId ? isMessageMediaDownloading(messageId) : false),
    () => false,
  )
}
