import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NowPlayingBar } from '@/components/NowPlayingBar'
import { InboxTabButton } from '@/components/InboxTabButton'
import { inboxScrollToTop } from '@/lib/inboxScroll'
import { getDefaultTabBarStyle } from '@/lib/navigation'
import { hapticSelection } from '@/lib/haptics'
import { useAuthStore } from '@/stores/authStore'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const { colorScheme: scheme } = useColorScheme()
  const isAdmin = useAuthStore((s) => s.agent?.role === 'admin')
  const isDark = scheme === 'dark'
  const defaultTabBarStyle = {
    ...getDefaultTabBarStyle(insets.bottom),
    ...(isDark ? { backgroundColor: '#121B22', borderTopColor: '#2A3942' } : { borderTopColor: '#E9EDEF' }),
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: isDark ? '#00A884' : '#008069',
          tabBarInactiveTintColor: isDark ? '#8696A0' : '#8696A0',
          tabBarStyle: defaultTabBarStyle,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: isDark ? '#0B141A' : '#F7F8FA' },
        }}
        screenListeners={{ tabPress: () => hapticSelection() }}
      >
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarLabel: 'Chats',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={24}
                color={color}
              />
            ),
            tabBarButton: (props) => <InboxTabButton {...props} />,
          }}
          listeners={({ navigation }) => ({
            tabPress: () => {
              if (navigation.isFocused()) {
                inboxScrollToTop()
              }
            },
          })}
        />
        <Tabs.Screen
          name="team"
          options={{
            href: isAdmin ? undefined : null,
            title: 'Team',
            tabBarLabel: 'Team',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'settings' : 'settings-outline'}
                size={23}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
      <NowPlayingBar />
    </View>
  )
}
