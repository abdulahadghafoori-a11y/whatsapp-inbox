/** Consecutive voice-note runs in chat order (broken by any non-audio message). */
export function buildVoiceNoteRuns(
  messages: { id: string; type: string; deletedAt?: string | null }[],
): string[][] {
  const runs: string[][] = []
  let current: string[] = []
  for (const m of messages) {
    if (m.type === 'audio' && !m.deletedAt) {
      current.push(m.id)
    } else if (current.length > 0) {
      runs.push(current)
      current = []
    }
  }
  if (current.length > 0) runs.push(current)
  return runs
}

export function flattenVoiceNoteRuns(runs: string[][]): string[] {
  return runs.flat()
}
