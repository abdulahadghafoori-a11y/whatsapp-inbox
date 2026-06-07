/** Force Gregorian calendar regardless of device locale (avoids Shamsi/Jalali on fa-IR devices). */
const LOCALE = 'en-US'

const timeOpts: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

const dateOpts: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  calendar: 'gregory',
}

/** Time only (HH:MM) for message footers — day context comes from date separators. */
export function formatMessageTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString(LOCALE, timeOpts)
}

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString(LOCALE, timeOpts)
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(LOCALE, dateOpts)
}

export function formatDateLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(LOCALE, {
    ...dateOpts,
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Hours remaining until the 24h window closes, or 0 if closed. */
export function windowHoursLeft(windowExpiresAt: string | null): number {
  if (!windowExpiresAt) return 0
  const ms = new Date(windowExpiresAt).getTime() - Date.now()
  return ms > 0 ? ms / (1000 * 60 * 60) : 0
}
