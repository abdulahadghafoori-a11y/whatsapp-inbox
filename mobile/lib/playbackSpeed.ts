export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export function formatPlaybackSpeed(rate: number): string {
  return rate === 1 ? '1×' : `${rate}×`
}

export function nextPlaybackSpeed(rate: number): PlaybackSpeed {
  const i = PLAYBACK_SPEEDS.indexOf(rate as PlaybackSpeed)
  const next = i < 0 ? 0 : (i + 1) % PLAYBACK_SPEEDS.length
  return PLAYBACK_SPEEDS[next]!
}
