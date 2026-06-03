import { View, Text, Pressable, Platform } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useGlobalAudioStore,
  type AudioTrack,
  type EngagedSession,
} from '@/stores/globalAudioStore'
import { formatDuration } from '@/lib/format'
import { PlaybackSpeedButton } from '@/components/PlaybackSpeedButton'

const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 56, default: 49 }) ?? 49

function isOnConversationScreen(pathname: string, conversationId: string) {
  return (
    pathname === `/inbox/${conversationId}` ||
    pathname.endsWith(`/inbox/${conversationId}`) ||
    pathname.includes(`/${conversationId}`)
  )
}

function resolveMiniTrack(
  track: AudioTrack | null,
  session: EngagedSession | null,
): AudioTrack | null {
  if (track) return track
  if (!session) return null
  return {
    uri: session.uri,
    messageId: session.messageId,
    conversationId: session.conversationId,
    variant: session.variant,
  }
}

/** Mini player above the tab bar — only when audio plays outside that chat. */
export function NowPlayingBar() {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const bottomOffset = TAB_BAR_HEIGHT + insets.bottom

  const track = useGlobalAudioStore((s) => s.track)
  const session = useGlobalAudioStore((s) => s.engagedSession)
  const wantPlaying = useGlobalAudioStore((s) => s.wantPlaying)
  const playback = useGlobalAudioStore((s) => s.playback)
  const pause = useGlobalAudioStore((s) => s.pause)
  const play = useGlobalAudioStore((s) => s.play)
  const stop = useGlobalAudioStore((s) => s.stop)

  const miniTrack = resolveMiniTrack(track, session)
  if (!miniTrack) return null

  if (isOnConversationScreen(pathname, miniTrack.conversationId)) return null

  const isPlaying = wantPlaying || playback.isPlaying
  const durationMs = playback.durationMs || session?.durationMs || 0
  const positionMs = playback.positionMs || session?.positionMs || 0
  const label =
    durationMs > 0
      ? `${formatDuration(positionMs / 1000)} / ${formatDuration(durationMs / 1000)}`
      : 'Voice message'

  return (
    <View
      style={{ bottom: bottomOffset }}
      className="absolute left-0 right-0 z-50 border-t border-wa-teal/30 bg-wa-teal px-2 py-2 shadow-md"
    >
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => {
            if (isPlaying) pause()
            else play(miniTrack)
          }}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          className="h-9 w-9 items-center justify-center rounded-full bg-white/20"
        >
          <Text className="text-sm text-white">{isPlaying ? '❚❚' : '▶'}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push(`/(tabs)/inbox/${miniTrack.conversationId}`)}
          className="min-w-0 flex-1"
        >
          <Text numberOfLines={1} className="text-sm font-semibold text-white">
            Voice message
          </Text>
          <Text numberOfLines={1} className="text-xs text-white/80">
            {label}
          </Text>
        </Pressable>

        <PlaybackSpeedButton variant="mini" />

        <Pressable
          onPress={stop}
          accessibilityRole="button"
          accessibilityLabel="Close and stop playback"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-white/20"
        >
          <Text className="text-base leading-none text-white">✕</Text>
        </Pressable>
      </View>
    </View>
  )
}
