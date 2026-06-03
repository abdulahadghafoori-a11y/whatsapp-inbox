import { Stack } from 'expo-router'

export default function InboxLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Inbox', headerShown: false }} />
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          freezeOnBlur: true,
        }}
      />
    </Stack>
  )
}
