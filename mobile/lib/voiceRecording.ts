import { Platform } from 'react-native'
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio'
import type { AudioRecorder } from 'expo-audio/build/AudioModule.types'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'

export type VoiceRecording = AudioRecorder

/** Stop playback and configure the session for microphone capture. */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  const perm = await requestRecordingPermissionsAsync()
  if (!perm.granted) {
    throw new Error('Microphone permission is required to record voice messages.')
  }

  useGlobalAudioStore.getState().stop()

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
  })

  // Android: 3GP/AMR (WhatsApp-native). iOS: standard AAC m4a — do not override preset options.
  const preset =
    Platform.OS === 'android' ? RecordingPresets.LOW_QUALITY : RecordingPresets.HIGH_QUALITY
  const recorder = new AudioModule.AudioRecorder(preset)
  await recorder.prepareToRecordAsync()
  recorder.record()
  return recorder
}

export async function stopVoiceRecording(
  recording: VoiceRecording,
  fallbackDurationMs = 0,
): Promise<{ uri: string; durationMs: number; filename: string; mimeType: string }> {
  await recording.stop()
  await new Promise((r) => setTimeout(r, 500))
  const status = recording.getStatus()
  const uri = recording.uri ?? status.url
  if (!uri) throw new Error('Recording failed — no audio file.')

  const durationMs = Math.max(status.durationMillis ?? 0, fallbackDurationMs)
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
  })
  const lower = uri.toLowerCase()
  const isAmr = lower.includes('.3gp') || lower.includes('.amr')
  const filename = isAmr ? `voice-${Date.now()}.3gp` : `voice-${Date.now()}.m4a`
  const mimeType = isAmr ? 'audio/amr' : 'audio/mp4'
  return { uri, durationMs, filename, mimeType }
}

export async function cancelVoiceRecording(recording: VoiceRecording): Promise<void> {
  try {
    await recording.stop()
  } catch {
    /* already stopped */
  }
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
  })
}
