import { Pressable, Text, StyleSheet } from 'react-native'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import { formatPlaybackSpeed } from '@/lib/playbackSpeed'

export function PlaybackSpeedButton({
  variant = 'bubble',
  visible = true,
  outbound = false,
}: {
  variant?: 'bubble' | 'mini' | 'avatar'
  visible?: boolean
  outbound?: boolean
}) {
  const playbackRate = useGlobalAudioStore((s) => s.playbackRate)
  const cyclePlaybackRate = useGlobalAudioStore((s) => s.cyclePlaybackRate)

  if (!visible) return null

  if (variant === 'avatar') {
    return (
      <Pressable
        onPress={cyclePlaybackRate}
        accessibilityRole="button"
        accessibilityLabel={`Playback speed ${formatPlaybackSpeed(playbackRate)}`}
        style={[
          styles.avatarBtn,
          outbound ? styles.avatarBtnOut : styles.avatarBtnIn,
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            outbound ? styles.avatarTextOut : styles.avatarTextIn,
          ]}
        >
          {formatPlaybackSpeed(playbackRate)}
        </Text>
      </Pressable>
    )
  }

  const pillClass =
    variant === 'mini'
      ? 'h-8 min-w-[40px] items-center justify-center rounded-full bg-white/20 px-2'
      : outbound
        ? 'h-7 min-w-[36px] items-center justify-center rounded-full bg-black/10 px-2 dark:bg-white/25'
        : 'h-7 min-w-[36px] items-center justify-center rounded-full bg-black/10 px-2 dark:bg-white/15'

  const textClass =
    variant === 'mini'
      ? 'text-xs font-semibold text-white'
      : outbound
        ? 'text-[11px] font-semibold text-neutral-800 dark:text-white'
        : 'text-[11px] font-semibold text-neutral-700 dark:text-neutral-200'

  return (
    <Pressable
      onPress={cyclePlaybackRate}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${formatPlaybackSpeed(playbackRate)}`}
      className={pillClass}
    >
      <Text className={textClass}>{formatPlaybackSpeed(playbackRate)}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtnIn: {
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
  },
  avatarBtnOut: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  avatarTextIn: {
    color: '#008069',
  },
  avatarTextOut: {
    color: '#ffffff',
  },
})
