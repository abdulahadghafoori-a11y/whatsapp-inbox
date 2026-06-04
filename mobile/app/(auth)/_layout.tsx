import { Stack } from 'expo-router'
import { authStackOptions } from '@/lib/navigation'

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, ...authStackOptions }} />
}
