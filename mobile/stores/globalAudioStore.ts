import { create } from 'zustand'
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types'
import { getAudioDuration, setAudioDuration } from '@/lib/audioDurationCache'
import { nextPlaybackSpeed, type PlaybackSpeed } from '@/lib/playbackSpeed'
import { safePause } from '@/lib/safeAudioPlayer'

export type AudioTrack = {
  uri: string
  messageId: string
  conversationId: string
  variant: 'inbound' | 'outbound'
}

/** UI snapshot for a voice message — survives pause / end until dismiss. */
export type EngagedSession = AudioTrack & {
  durationMs: number
  positionMs: number
}

export type AudioPlayback = {
  isPlaying: boolean
  isLoaded: boolean
  durationMs: number
  positionMs: number
  didJustFinish: boolean
}

const idlePlayback: AudioPlayback = {
  isPlaying: false,
  isLoaded: false,
  durationMs: 0,
  positionMs: 0,
  didJustFinish: false,
}

function sessionFrom(
  source: AudioTrack | EngagedSession | null,
  playback: AudioPlayback,
): EngagedSession | null {
  if (!source || playback.durationMs <= 0) return null
  return {
    uri: source.uri,
    messageId: source.messageId,
    conversationId: source.conversationId,
    variant: source.variant,
    durationMs: playback.durationMs,
    positionMs: playback.positionMs,
  }
}

type GlobalAudioState = {
  track: AudioTrack | null
  engagedSession: EngagedSession | null
  wantPlaying: boolean
  playback: AudioPlayback
  playbackRate: PlaybackSpeed
  _player: AudioPlayer | null
  bindPlayer: (player: AudioPlayer | null) => void
  setPlayback: (patch: Partial<AudioPlayback>) => void
  setPlaybackRate: (rate: PlaybackSpeed) => void
  cyclePlaybackRate: () => void
  applyPlaybackRateToPlayer: () => void
  play: (track: AudioTrack) => void
  pause: () => void
  /** Finished or paused — keep bubble UI, release native player. */
  finishPlayback: () => void
  /** Close mini-player — clear everything. */
  stop: () => void
  toggle: (track: AudioTrack) => void
  seekRatio: (ratio: number) => void
  clearIfMessage: (messageId: string) => void
}

export const useGlobalAudioStore = create<GlobalAudioState>((set, get) => ({
  track: null,
  engagedSession: null,
  wantPlaying: false,
  playback: idlePlayback,
  playbackRate: 1,
  _player: null,

  bindPlayer: (player) => set({ _player: player }),

  setPlayback: (patch) =>
    set((s) => {
      const playback: AudioPlayback = {
        ...s.playback,
        ...patch,
        durationMs:
          (patch.durationMs ?? 0) > 0 ? patch.durationMs! : s.playback.durationMs,
        positionMs:
          (patch.positionMs ?? 0) > 0 ? patch.positionMs! : s.playback.positionMs,
        isLoaded: patch.isLoaded ?? s.playback.isLoaded,
      }
      if (s.track && playback.durationMs > 0) {
        setAudioDuration(s.track.messageId, playback.durationMs)
      }
      const base = s.track ?? s.engagedSession
      const engagedSession = base
        ? sessionFrom(base, playback) ?? s.engagedSession
        : s.engagedSession
      return { playback, engagedSession }
    }),

  setPlaybackRate: (rate) => {
    set({ playbackRate: rate })
    get().applyPlaybackRateToPlayer()
  },

  cyclePlaybackRate: () => {
    const next = nextPlaybackSpeed(get().playbackRate)
    get().setPlaybackRate(next)
  },

  applyPlaybackRateToPlayer: () => {
    const { _player, playbackRate } = get()
    if (!_player) return
    try {
      _player.setPlaybackRate(playbackRate)
    } catch {
      // native object gone
    }
  },

  play: (track) => {
    const { track: cur, engagedSession } = get()
    if (cur?.messageId === track.messageId) {
      set({ wantPlaying: true })
      get().applyPlaybackRateToPlayer()
      return
    }

    const cachedDuration = getAudioDuration(track.messageId)
    const resumeFromSession =
      engagedSession?.messageId === track.messageId ? engagedSession : null
    const atEnd =
      resumeFromSession != null &&
      resumeFromSession.positionMs >= resumeFromSession.durationMs - 300
    const resume = resumeFromSession
      ? {
          isPlaying: false,
          isLoaded: false,
          durationMs: resumeFromSession.durationMs,
          positionMs: atEnd ? 0 : resumeFromSession.positionMs,
          didJustFinish: false,
        }
      : cachedDuration > 0
        ? {
            isPlaying: false,
            isLoaded: false,
            durationMs: cachedDuration,
            positionMs: 0,
            didJustFinish: false,
          }
        : idlePlayback

    set({
      track,
      wantPlaying: true,
      playback: resume,
      engagedSession: resumeFromSession
        ? {
            ...resumeFromSession,
            positionMs: atEnd ? 0 : resumeFromSession.positionMs,
          }
        : cachedDuration > 0
          ? {
              ...track,
              durationMs: cachedDuration,
              positionMs: 0,
            }
          : null,
    })
  },

  pause: () => {
    const s = get()
    if (s._player) safePause(s._player)
    const engagedSession =
      sessionFrom(s.track ?? s.engagedSession, s.playback) ?? s.engagedSession
    set({ wantPlaying: false, engagedSession })
  },

  finishPlayback: () => {
    const s = get()
    if (s._player) safePause(s._player)
    const finalPlayback: AudioPlayback = {
      ...s.playback,
      isPlaying: false,
      positionMs:
        s.playback.durationMs > 0 ? s.playback.durationMs : s.playback.positionMs,
    }
    const engagedSession =
      sessionFrom(s.track ?? s.engagedSession, finalPlayback) ?? s.engagedSession
    set({
      track: null,
      wantPlaying: false,
      playback: idlePlayback,
      engagedSession,
    })
  },

  stop: () => {
    const { _player } = get()
    if (_player) safePause(_player)
    set({
      track: null,
      engagedSession: null,
      wantPlaying: false,
      playback: idlePlayback,
    })
  },

  toggle: (track) => {
    const { track: cur, engagedSession, wantPlaying, playback } = get()
    const isThisTrack =
      cur?.messageId === track.messageId || engagedSession?.messageId === track.messageId
    if (isThisTrack && (wantPlaying || playback.isPlaying)) {
      get().pause()
      return
    }
    get().play(track)
  },

  seekRatio: (ratio) => {
    const { _player, playback, engagedSession } = get()
    const durationMs = playback.durationMs || engagedSession?.durationMs || 0
    if (durationMs <= 0) return
    const positionMs = ratio * durationMs
    const sec = positionMs / 1000

    if (_player) {
      try {
        void _player.seekTo(sec)
      } catch {
        // ignore
      }
    }

    set((s) => {
      const nextPlayback = {
        ...s.playback,
        durationMs,
        positionMs,
        isLoaded: true,
      }
      const session =
        sessionFrom(s.track ?? s.engagedSession, nextPlayback) ??
        (s.engagedSession
          ? { ...s.engagedSession, durationMs, positionMs }
          : null)
      return { playback: nextPlayback, engagedSession: session }
    })
  },

  clearIfMessage: (messageId) => {
    const s = get()
    if (s.track?.messageId === messageId || s.engagedSession?.messageId === messageId) {
      get().stop()
    }
  },
}))
