import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import soundData from '@/lib/waSoundData.json'

/** Outbound send pop (~80ms) — same feel as WhatsApp release-to-send. */
const SEND_WAV_B64 =
  'UklGRiQFAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAFAAAAAF5FXmprXncnCt9ipjmXEbhw+Sc9RGQzXaMrpObprTybxbZ580s1H16OWzMvvO1CtXufALYY7s4t91eIWTAyUvRmvOijubVI6bQm11ErV6I0aPpQw3uo5LUD5f0fxUuDVJE2AAD6ySmteLZE4awZy0WaUQY4HAVg0Omxa7cE3sAT7z96Tgg5wQl/1rO2srg92zoONjosS6E58g1U3H67Rrrq2BgJpjS5R9k5sRHc4UTAHbwC11sERC8pRLc5BBUW5/3EL76B1QAAEyqEQEQ58BcC7KXJc8Bf1AX8FyXRPIc4dxqf8DbO4sKV02f4UyAWOYg3oRzs9KvSdcUe0yT1yBtaNU02cR7r+ADXJcjz0jnyeRejMd807B+c/DHb68oN06LvZxP1LUIzGCEAADzfws1n01ztkg9VKn4x+iEZAx3jo9D602Pr+gvHJpkvlyLrBdTmi9PB1LTpoQhOI5gt9CJ1CF3qc9a21UvohAXuH4ArFiO7CrjtWNnT1iTnpAKrHFcpASO/DOTwNtwV2DrmAACFGSEnvCKEDuDzCN912Yrllv1/FuMkSSINEKz2zeHv2hDlZfubE6AiriFdEUj5geR+3MfkavnaEFwg7yB2ErT7Iucf3q3kpfc9DhseESBdE/L9renO373kE/bEC+AbFx8TFAAAIeyH4fPksvRxCa0ZBR6cFOEBe+5G403lgPNEB4UX3hz7FJYDvPAJ5cXlevI7BWoVpxszFSEF4fLM5lrmn/FYA14TYhpIFYIG6vSO6Afn7PCaAWMRExk7FbsH1vZL6srnXvAAAHoPuxcRFc4IpvgB7J/o8++J/qUNXxbLFLwJWPqv7YXpqe81/eQLABVtFIgK7ftT73fqfe8C/DgKoBP6EzILZf3r8HTrbu/v+qIIQhJzE74Lwf528nnsd+/7+SMH6BDbEi0MAADy84XtmO8l+boFkg81EoAMJAFg9ZTuzu9r+GgEQw6CEbkMLQK+9qXvF/DN9ywD/QzFENwMHAML+LfwcvBI9wcCvwsAEOgM8gNH+cjx2/Db9vgAiwo1D+AMsARx+tbyUfGF9gAAYwllDscMVwWK++Dz0vFE9h3/RgiRDZ0M5wWS/OT0XfIX9k7+Nge8DGQMYwaI/eP18PL99ZT9MwbnCx0MygZs/tr2ivPz9e38PAUTC8wLHwc//8r3KPT59Vn8VARBCnALYgcAALH4yvQN9tj7eQNyCQsLlQexAI75b/Uu9mf7rAKnCJ4KuAdSAWL6FfZa9gf77AHgBywKzAfjASz7u/aR9rb6OwEgB7QJ1AdlAuz7YPfQ9nT6lgBlBjkJzwfYAqH8BPgY90D6AACxBbsIwAc9A0z9pfhn9xn6d/8FBTsIpgeVA+z9Q/m79/75+f5fBLkHgwffA4H+3vkU+O35iP7CAzgHWQceBAv/dPpx+Oj5I/4tA7cGJwdSBIv/BfvR+Ov5yf2gAjgG7wZ6BAAAkfs0+ff5e/0bAroFsgaZBGsAGPyY+Qv6Nv2fAT8FcQauBM0AmPz8+Sb6/PwqAccEKwa7BCUBE/1h+kf6y/y/AFIE4wW/BHMBh/3F+m76o/xbAOEDmAW8BLkB9f0o+5n6g/wAAHQDSwWzBPcBXP6K+8n6bPyt/wsD/QSjBCwCvf7q+/z6W/xh/6cCrwSOBFkCGP9I/DL7Ufwc/0cCYQR1BH8CbP+j/Gv7Tvzf/u0BEwRXBA=='

export type WaFeedbackSound = 'recordStart' | 'recordCancel' | 'send' | 'sent'

const FILES: Record<WaFeedbackSound, { b64: string; volume: number; tailMs: number }> = {
  recordStart: { b64: soundData.recordStart, volume: 0.55, tailMs: 110 },
  recordCancel: { b64: soundData.recordCancel, volume: 0.45, tailMs: 120 },
  send: { b64: SEND_WAV_B64, volume: 0.45, tailMs: 100 },
  sent: { b64: soundData.sent, volume: 0.38, tailMs: 90 },
}

const uriCache = new Map<WaFeedbackSound, string>()
let lastSentSoundAt = 0

async function uriFor(kind: WaFeedbackSound): Promise<string> {
  const cached = uriCache.get(kind)
  if (cached) return cached
  const path = `${FileSystem.cacheDirectory}wa-fx-v5-${kind}.wav`
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(path, FILES[kind].b64, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }
  uriCache.set(kind, path)
  return path
}

/** Cancel works because playback mode is set — all clips need the same session. */
async function ensurePlaybackMode(): Promise<void> {
  useGlobalAudioStore.getState().stop()
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
  })
}

async function playClip(kind: WaFeedbackSound): Promise<void> {
  await ensurePlaybackMode()
  const uri = await uriFor(kind)
  const player = createAudioPlayer(uri)
  player.volume = FILES[kind].volume
  player.play()
  await new Promise((r) => setTimeout(r, FILES[kind].tailMs))
}

/** Cache wav files on disk (does not create native players). */
export function warmWaFeedbackSounds(): Promise<void> {
  const kinds = Object.keys(FILES) as WaFeedbackSound[]
  return Promise.all(kinds.map(uriFor)).then(() => undefined)
}

/** Fire-and-forget UI feedback (record / send / cancel / sent). */
export function playWaFeedback(kind: WaFeedbackSound): void {
  if (kind === 'sent') {
    const now = Date.now()
    if (now - lastSentSoundAt < 300) return
    lastSentSoundAt = now
  }
  void playClip(kind).catch(() => undefined)
}

/** Awaitable — use before starting the microphone or right after stopping it. */
export async function playWaFeedbackAsync(kind: WaFeedbackSound): Promise<void> {
  if (kind === 'sent') {
    const now = Date.now()
    if (now - lastSentSoundAt < 300) return
    lastSentSoundAt = now
  }
  try {
    await playClip(kind)
  } catch {
    /* non-critical */
  }
}

/** @deprecated Use playWaFeedback('send') */
export async function playSendSound(): Promise<void> {
  await playWaFeedbackAsync('send')
}
