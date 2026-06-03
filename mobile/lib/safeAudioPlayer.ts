import type { AudioPlayer } from 'expo-audio/build/AudioModule.types'

/** expo-audio native object may already be released on unmount — never throw from cleanup. */
export function safePause(player: AudioPlayer) {
  try {
    player.pause()
  } catch {
    // NativeSharedObjectNotFoundException after hook teardown
  }
}

export function safePlay(player: AudioPlayer) {
  try {
    player.play()
  } catch {
    // ignore
  }
}
