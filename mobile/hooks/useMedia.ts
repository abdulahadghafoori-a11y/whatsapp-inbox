import { useQuery } from '@tanstack/react-query'
import { mediaApiPath } from '@/lib/mediaApi'
import { api } from '@/services/api'

/** Resolves an S3 key to a short-lived presigned URL (cached ~50 min). */
export function useMediaUrl(
  s3Key: string | null | undefined,
  messageId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['media', s3Key, messageId],
    enabled: !!s3Key && !!messageId,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const key = s3Key as string
      const id = messageId as string
      const res = await api.get<{ url: string; expiresAt: string }>(mediaApiPath(key, id))
      return res.data.url
    },
  })
}
