export type VoiceRecording = {
  cancel: () => void
}

const webVoiceError = () =>
  new Error('Voice recording is not available in the browser. Use the Android or iOS app.')

export async function startVoiceRecording(): Promise<VoiceRecording> {
  throw webVoiceError()
}

export async function stopVoiceRecording(): Promise<{
  uri: string
  durationMs: number
  filename: string
  mimeType: string
}> {
  throw webVoiceError()
}

export async function cancelVoiceRecording(): Promise<void> {
  // no-op
}
