import { useShallow } from 'zustand/react/shallow'
import { useGlobalAudioStore, type EngagedSession } from '@/stores/globalAudioStore'

export type AudioPlayerState = {
  isActive: boolean
  isPlaying: boolean
  showSpeedSlot: boolean
  loading: boolean
  positionMs: number
  durationMs: number
  session: EngagedSession | null
}

const INACTIVE: AudioPlayerState = {
  isActive: false,
  isPlaying: false,
  showSpeedSlot: false,
  loading: false,
  positionMs: 0,
  durationMs: 0,
  session: null,
}

/** Per-message audio UI state — inactive bubbles skip playback tick re-renders. */
export function useAudioPlayerState(messageId: string): AudioPlayerState {
  return useGlobalAudioStore(
    useShallow((s) => {
      const isActive = s.track?.messageId === messageId
      const session =
        s.engagedSession?.messageId === messageId ? s.engagedSession : null
      if (!isActive && !session) return INACTIVE

      const durationMs = session
        ? session.durationMs
        : isActive
          ? s.playback.durationMs
          : 0
      const positionMs = session
        ? isActive
          ? s.playback.positionMs
          : session.positionMs
        : isActive
          ? s.playback.positionMs
          : 0
      const isPlaying = isActive && (s.wantPlaying || s.playback.isPlaying)

      return {
        isActive,
        session,
        isPlaying,
        showSpeedSlot:
          isActive && (s.wantPlaying || s.playback.isPlaying || s.playback.isLoaded),
        loading: isActive && s.wantPlaying && !s.playback.isLoaded,
        positionMs,
        durationMs,
      }
    }),
  )
}
