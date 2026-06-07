declare module '@imcooder/opuslib' {
  export type AudioStartedEvent = {
    timestamp: number
    sampleRate: number
    channels: number
    bitrate: number
    frameSize: number
    preSkip: number
  }

  export type OpusFrame = {
    data: ArrayBuffer
    audioLevel?: number
  }

  export type AudioChunkEvent = {
    frames: OpusFrame[]
    timestamp: number
    sequenceNumber: number
    duration: number
    frameCount: number
  }

  export type AmplitudeEvent = {
    rms: number
    peak: number
    timestamp: number
  }

  export type AudioConfig = {
    sampleRate: number
    channels: number
    bitrate: number
    frameSize: number
    framesPerCallback?: number
    enableAmplitudeEvents?: boolean
    amplitudeEventInterval?: number
    iosAudioSession?: {
      category: 'record' | 'playAndRecord' | 'playback' | 'ambient'
      mode: 'default' | 'voiceChat' | 'measurement' | 'spokenAudio'
      options?: Array<
        'mixWithOthers' | 'defaultToSpeaker' | 'allowBluetooth' | 'allowAirPlay' | 'allowBluetoothA2DP'
      >
    }
  }

  type Subscription = { remove: () => void }

  const Opuslib: {
    startStreaming(config: AudioConfig): Promise<void>
    stopStreaming(): Promise<void>
    addListener(event: 'audioStarted', cb: (e: AudioStartedEvent) => void): Subscription
    addListener(event: 'audioChunk', cb: (e: AudioChunkEvent) => void): Subscription
    addAmplitudeListener(cb: (e: AmplitudeEvent) => void): Subscription
  }

  export default Opuslib
}
