import { useQuery, useQueryClient } from '@tanstack/react-query'
import { presignViaBatch } from '@/lib/mediaPresignBatch'

/** Resolves an S3 key to a short-lived presigned URL (cached ~50 min). */
export function useMediaUrl(
  s3Key: string | null | undefined,
  messageId: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  const qc = useQueryClient()
  const enabled = opts?.enabled !== false && !!s3Key && !!messageId
  return useQuery({
    queryKey: ['media', s3Key, messageId],
    enabled,
    staleTime: 50 * 60 * 1000,
    // Go through the shared batch coordinator so the hook and the viewport
    // prefetch collapse into a single /media/batch request per key.
    queryFn: () => presignViaBatch(qc, s3Key as string, messageId as string),
  })
}
