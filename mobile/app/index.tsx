import { View, ActivityIndicator } from 'react-native'

// Placeholder shown briefly while AuthGate (in _layout) redirects to
// the correct group based on stored credentials.
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-[#F7F8FA] dark:bg-wa-panelDeep">
      <ActivityIndicator size="large" color="#00A884" />
    </View>
  )
}
