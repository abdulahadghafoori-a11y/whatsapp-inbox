import { Stack } from 'expo-router'
import { stackTransitionOptions } from '@/lib/navigation'

/** Full-screen chat over tabs — entire tab UI slides away as one card. */
export default function ConversationLayout() {
  return <Stack screenOptions={{ headerShown: false, ...stackTransitionOptions }} />
}
