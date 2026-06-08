/**
 * Collision-proof client-side ids for optimistic rows. `Date.now()` alone
 * collides when two sends fire in the same millisecond (rapid taps, queue
 * flush), which corrupts the optimistic→server reconciliation by primary key.
 */
function rand(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function newPendingId(kind: 'text' | 'media' | 'location'): string {
  return `pending-${kind}-${Date.now()}-${rand()}`
}
