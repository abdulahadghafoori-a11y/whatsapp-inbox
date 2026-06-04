/** Map expo-audio recorder metering (dB, typically -160…0) to 0…1 bar height. */
export function meteringToLevel(metering: number | undefined): number {
  if (metering == null || Number.isNaN(metering)) return 0.12
  if (metering > 0 && metering <= 1) return 0.12 + metering * 0.88
  const clamped = Math.max(-60, Math.min(0, metering))
  return 0.1 + ((clamped + 60) / 60) * 0.9
}
