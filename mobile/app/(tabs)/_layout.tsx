import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { NowPlayingBar } from '@/components/NowPlayingBar'

export default function TabsLayout() {
  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#128C7E',
          tabBarInactiveTintColor: '#9ca3af',
        }}
      >
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💬</Text>,
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text>,
          }}
        />
      </Tabs>
      <NowPlayingBar />
    </View>
  )
}
