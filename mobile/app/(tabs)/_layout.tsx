import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NowPlayingBar } from '@/components/NowPlayingBar'
import { InboxTabButton } from '@/components/InboxTabButton'
import { getDefaultTabBarStyle } from '@/lib/navigation'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const defaultTabBarStyle = getDefaultTabBarStyle(insets.bottom)

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#128C7E',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: defaultTabBarStyle,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: '#f5f5f5' },
        }}
      >
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarLabel: 'Inbox',
            tabBarIcon: ({ color, focused }) => (
              <Text style={{ color, fontSize: 22, opacity: focused ? 1 : 0.85 }}>💬</Text>
            ),
            tabBarButton: (props) => <InboxTabButton {...props} />,
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarLabel: 'Team',
            tabBarIcon: ({ color, focused }) => (
              <Text style={{ color, fontSize: 22, opacity: focused ? 1 : 0.85 }}>👥</Text>
            ),
          }}
        />
      </Tabs>
      <NowPlayingBar />
    </View>
  )
}
