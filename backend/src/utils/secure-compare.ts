import { timingSafeEqual } from 'node:crypto'

/**
 * Was: plain `===` on verify tokens — timing side-channel risk.
 * Now: constant-time compare when lengths match.
 */
export function secureCompareStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
