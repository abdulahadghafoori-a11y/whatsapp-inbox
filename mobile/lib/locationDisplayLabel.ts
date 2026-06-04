import type { MessageLocation } from '@/lib/messageLocation'

function normalizePart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Avoid repeating the same place name in geocoded strings. */
export function dedupeAddressParts(parts: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    const key = normalizePart(part)
    if (seen.has(key)) continue
    const joined = out.join(', ').toLowerCase()
    if (joined && joined.includes(key)) continue
    seen.add(key)
    out.push(part)
  }
  return out
}

/** One line for location bubbles — avoids duplicating name + address. */
export function locationDisplayLabel(loc: MessageLocation): string {
  const address = loc.address?.trim()
  const name = loc.name?.trim()

  if (address && name) {
    const addrNorm = normalizePart(address)
    const nameNorm = normalizePart(name)
    if (nameNorm === 'current location' || addrNorm.includes(nameNorm)) {
      return address
    }
  }

  if (address) return address
  if (name) return name
  return `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
}
