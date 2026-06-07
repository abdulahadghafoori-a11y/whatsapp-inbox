import { requireNativeModule } from 'expo-modules-core'

export default requireNativeModule<{
  clip(inputUri: string, startMs: number, endMs: number): Promise<string>
}>('ExpoVideoClip')
