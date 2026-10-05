import { Redirect, Stack } from 'expo-router'
import { FullscreenSpinner } from '../../src/components/feedback'
import { NotificationsProvider } from '../../src/store/notifications'
import { useAuth } from '../../src/store/auth'
import { colors } from '../../src/theme'

/** Everything inside (app) needs a signed-in citizen. */
export default function AppLayout() {
  const { status } = useAuth()
  if (status === 'loading') return <FullscreenSpinner />
  if (status === 'signedOut') return <Redirect href="/login" />
  return (
    <NotificationsProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </NotificationsProvider>
  )
}
