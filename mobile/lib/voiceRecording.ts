import {
  cancelOpusVoiceRecording,
  finishOpusVoiceRecording,
  startOpusVoiceRecording,
  type OpusVoiceHandle,
} from '@/lib/opusVoiceRecorder'

export type VoiceRecording = OpusVoiceHandle

/** Stop playback and start Opus voice capture (OGG on stop). */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  return startOpusVoiceRecording()
}

export async function stopVoiceRecording(
  recording: VoiceRecording,
  fallbackDurationMs = 0,
): Promise<{ uri: string; durationMs: number; filename: string; mimeType: string }> {
  return finishOpusVoiceRecording(recording, fallbackDurationMs)
}

export async function cancelVoiceRecording(recording: VoiceRecording): Promise<void> {
  return cancelOpusVoiceRecording(recording)
}
