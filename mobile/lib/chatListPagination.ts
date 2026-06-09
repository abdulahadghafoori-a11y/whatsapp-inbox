/** Stream-style: only fire pagination once per FlatList content length. */
export type PaginationLengthTracker = Record<number, boolean>

export function shouldSkipPaginationAtLength(
  tracker: PaginationLengthTracker,
  dataLength: number,
): boolean {
  return dataLength > 0 && !!tracker[dataLength]
}

export function markPaginationAtLength(
  tracker: PaginationLengthTracker,
  dataLength: number,
): void {
  if (dataLength > 0) tracker[dataLength] = true
}

export function resetPaginationTracker(tracker: PaginationLengthTracker): void {
  for (const key of Object.keys(tracker)) {
    delete tracker[Number(key)]
  }
}

/** Release tracker entry after a failed fetch so the user can retry by scrolling. */
export function releasePaginationAtLength(
  tracker: PaginationLengthTracker,
  dataLength: number,
  delayMs = 2000,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    delete tracker[dataLength]
  }, delayMs)
}
