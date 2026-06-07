import { Platform, PermissionsAndroid } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import Opuslib from '@imcooder/opuslib'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import { assertOggOpusStructure, muxOpusPacketsToOgg } from '@/lib/oggOpusMuxer'

const SAMPLE_RATE = 48000
const FRAME_MS = 20
const BITRATE = 24000

export type OpusVoiceHandle = {
  getStatus: () => {
    isRecording: boolean
    durationMillis: number
    metering: number | undefined
    url: string | null
  }
  stop: () => Promise<void>
}

type ChunkSub = { remove: () => void }
type AmpSub = { remove: () => void }

let packets: Uint8Array[] = []
let preSkip = 0
let startedAt = 0
let lastMetering: number | undefined
let startedSub: ChunkSub | null = null
let chunkSub: ChunkSub | null = null
let ampSub: AmpSub | null = null
let activeHandle: OpusVoiceHandle | null = null

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    )
    return granted === PermissionsAndroid.RESULTS.GRANTED
  }
  return true
}

export async function startOpusVoiceRecording(): Promise<OpusVoiceHandle> {
  if (activeHandle) {
    try {
      await Opuslib.stopStreaming()
    } catch {
      /* ignore */
    }
  }

  const permitted = await requestMicPermission()
  if (!permitted) {
    throw new Error('Microphone permission is required to record voice messages.')
  }

  useGlobalAudioStore.getState().stop()

  packets = []
  preSkip = 0
  startedAt = Date.now()
  lastMetering = undefined

  startedSub?.remove()
  chunkSub?.remove()
  ampSub?.remove()

  startedSub = Opuslib.addListener('audioStarted', (event) => {
    preSkip = event.preSkip ?? 0
  })

  chunkSub = Opuslib.addListener('audioChunk', (event) => {
    for (const frame of event.frames) {
      packets.push(new Uint8Array(frame.data))
    }
  })

  ampSub = Opuslib.addAmplitudeListener((event) => {
    const peak = event.peak ?? 0
    lastMetering = peak > 0 ? 20 * Math.log10(Math.max(peak, 1e-6)) : -60
  })

  await Opuslib.startStreaming({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitrate: BITRATE,
    frameSize: FRAME_MS,
    framesPerCallback: 5,
    enableAmplitudeEvents: true,
    amplitudeEventInterval: 65,
    iosAudioSession: {
      category: 'playAndRecord',
      mode: 'spokenAudio',
      options: ['mixWithOthers', 'defaultToSpeaker', 'allowBluetooth'],
    },
  })

  const handle: OpusVoiceHandle = {
    getStatus() {
      return {
        isRecording: true,
        durationMillis: Date.now() - startedAt,
        metering: lastMetering,
        url: null,
      }
    },
    async stop() {
      await Opuslib.stopStreaming()
      startedSub?.remove()
      chunkSub?.remove()
      ampSub?.remove()
      startedSub = null
      chunkSub = null
      ampSub = null
      activeHandle = null
    },
  }

  activeHandle = handle
  return handle
}

export async function finishOpusVoiceRecording(
  handle: OpusVoiceHandle,
  fallbackDurationMs = 0,
): Promise<{ uri: string; durationMs: number; filename: string; mimeType: string }> {
  await handle.stop()

  const durationMs = Math.max(Date.now() - startedAt, fallbackDurationMs)
  if (packets.length === 0) {
    throw new Error('Recording failed — no audio captured.')
  }

  const ogg = muxOpusPacketsToOgg(packets, {
    sampleRate: SAMPLE_RATE,
    preSkip,
    frameDurationMs: FRAME_MS,
  })
  assertOggOpusStructure(ogg)

  const dest = `${FileSystem.cacheDirectory}wa-voice-${Date.now()}.ogg`
  const base64 = uint8ToBase64(ogg)
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const info = await FileSystem.getInfoAsync(dest)
  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0
  if (size < 200) {
    throw new Error('Could not save voice recording.')
  }

  packets = []
  return {
    uri: dest,
    durationMs,
    filename: `voice-${Date.now()}.ogg`,
    mimeType: 'audio/ogg',
  }
}

export async function cancelOpusVoiceRecording(handle: OpusVoiceHandle): Promise<void> {
  packets = []
  await handle.stop().catch(() => undefined)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...sub)
  }
  return btoa(binary)
}
