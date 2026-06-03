import { View, Text, Pressable, ActivityIndicator } from 'react-native'

export function QueryLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <ActivityIndicator size="large" color="#128C7E" />
      <Text className="mt-3 text-sm text-neutral-500">{label}</Text>
    </View>
  )
}

export function QueryError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-center text-base font-semibold text-neutral-800">
        Could not load data
      </Text>
      <Text className="mt-2 text-center text-sm text-neutral-500">{message}</Text>
      <Pressable
        onPress={onRetry}
        className="mt-6 rounded-xl bg-wa-teal px-6 py-3 active:opacity-90"
      >
        <Text className="font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  )
}
