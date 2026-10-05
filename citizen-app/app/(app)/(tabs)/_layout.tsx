import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '../../../src/components/ui'
import { useI18n } from '../../../src/i18n'
import type { TranslationKey } from '../../../src/i18n/en'
import type { IconName } from '../../../src/lib/domain'
import { useNotifications } from '../../../src/store/notifications'
import { colors } from '../../../src/theme'

const TABS: { name: string; label: TranslationKey; icon: IconName; active: IconName }[] = [
  { name: 'home', label: 'nav.home', icon: 'home-outline', active: 'home' },
  { name: 'report', label: 'nav.report', icon: 'plus-circle-outline', active: 'plus-circle' },
  { name: 'complaints', label: 'nav.complaints', icon: 'clipboard-text-outline', active: 'clipboard-text' },
  { name: 'notifications', label: 'nav.notifications', icon: 'bell-outline', active: 'bell' },
  { name: 'profile', label: 'nav.profile', icon: 'account-outline', active: 'account' },
]

export default function TabsLayout() {
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const { unreadCount } = useNotifications()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface, borderTopColor: colors.border,
          height: 58 + Math.max(insets.bottom, Platform.OS === 'web' ? 0 : 6),
          paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6),
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarLabel: t(tab.label),
            tabBarAccessibilityLabel: t(tab.label),
            tabBarBadge: tab.name === 'notifications' && unreadCount > 0 ? Math.min(unreadCount, 99) : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
            tabBarIcon: ({ focused, color }) => <Icon name={focused ? tab.active : tab.icon} color={color} size={24} />,
          }}
        />
      ))}
    </Tabs>
  )
}
