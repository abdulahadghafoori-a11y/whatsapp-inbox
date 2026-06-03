import { View, Text } from 'react-native'
import { windowHoursLeft } from '@/lib/format'

/**
 * 24h WhatsApp session window indicator.
 * - hidden when > 2h remain
 * - orange warning when < 2h
 * - red + "closed" when expired
 */
export function WindowExpiryBanner({ windowExpiresAt }: { windowExpiresAt: string | null }) {
  const hoursLeft = windowHoursLeft(windowExpiresAt)
  const closed = !windowExpiresAt || hoursLeft <= 0

  if (!closed && hoursLeft >= 2) return null

  if (closed) {
    return (
      <View className="bg-red-50 px-4 py-2">
        <Text className="text-center text-sm text-red-700">
          Window closed. Only Message Templates can be sent.
        </Text>
      </View>
    )
  }

  const label =
    hoursLeft >= 1
      ? `${Math.floor(hoursLeft)} hour${Math.floor(hoursLeft) === 1 ? '' : 's'}`
      : `${Math.ceil(hoursLeft * 60)} min`

  return (
    <View className="bg-orange-50 px-4 py-2">
      <Text className="text-center text-sm text-orange-700">
        24-hour window closes in {label}. After that, only Message Templates can be sent.
      </Text>
    </View>
  )
}
