import { memo } from 'react'
import { View, Text, type ViewStyle } from 'react-native'

/**
 * Deterministic, colorful initials avatar (WhatsApp-style). The same name
 * always maps to the same gradient pair, so a contact keeps a stable identity
 * colour across the app without storing anything.
 */

const PALETTE: [string, string][] = [
  ['#34B7F1', '#0E86C7'], // blue
  ['#25D366', '#0FA958'], // green
  ['#F6A609', '#E8870A'], // amber
  ['#EC5B7B', '#D43F63'], // pink
  ['#9B59F6', '#7B36E0'], // purple
  ['#FF7A59', '#F0562E'], // coral
  ['#1FB5A8', '#0E9488'], // teal
  ['#6C7A89', '#4B5563'], // slate
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const base = (name?.trim() || fallback).replace(/^\+/, '')
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return base.slice(0, 2).toUpperCase()
}

function AvatarBase({
  name,
  fallback = '?',
  size = 52,
  style,
}: {
  name: string | null | undefined
  fallback?: string
  size?: number
  style?: ViewStyle
}) {
  const key = name?.trim() || fallback
  const [, base] = PALETTE[hash(key) % PALETTE.length]
  const fontSize = Math.round(size * 0.36)

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: base,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: '#ffffff', fontSize, fontWeight: '700' }}>
        {initialsOf(name, fallback)}
      </Text>
    </View>
  )
}

export const Avatar = memo(AvatarBase)
