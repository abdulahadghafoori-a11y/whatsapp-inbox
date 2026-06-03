import { useVideoPlayer, VideoView } from 'expo-video'

export function ChatVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false
  })

  return (
    <VideoView
      player={player}
      style={{ width: 260, height: 180, borderRadius: 12, overflow: 'hidden' }}
      nativeControls
      contentFit="contain"
    />
  )
}
