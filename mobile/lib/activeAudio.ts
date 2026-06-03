import type { AudioPlayer } from 'expo-audio/build/AudioModule.types'
import { safePause } from '@/lib/safeAudioPlayer'

let active: AudioPlayer | null = null

export function playExclusive(player: AudioPlayer) {
  if (active && active !== player) {
    try {
      if (active.playing) safePause(active)
    } catch {
      // previous player may already be disposed
    }
  }
  active = player
}

export function clearExclusive(player: AudioPlayer) {
  if (active === player) active = null
}
