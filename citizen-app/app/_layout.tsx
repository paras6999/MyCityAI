import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ToastProvider, useToast } from '../src/components/feedback'
import { I18nProvider, useI18n } from '../src/i18n'
import { AuthProvider } from '../src/store/auth'
import { ReportProvider } from '../src/store/report'
import { colors } from '../src/theme'
import '../src/lib/push'

function Providers() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()

  // Tapping a push notification opens the complaint it is about (docs/API.md §10.2).
  useEffect(() => {
    if (Platform.OS === 'web') return
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.content.data?.complaint_id
      if (typeof id === 'string' && /^\d+$/.test(id)) router.push({ pathname: '/complaint/[id]', params: { id } })
    })
    return () => subscription.remove()
  }, [router])

  return (
    <AuthProvider onSessionExpired={() => toast.show(t('common.sessionExpired'), 'warning')}>
      <ReportProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }} />
      </ReportProvider>
    </AuthProvider>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Providers />
        </ToastProvider>
      </I18nProvider>
    </SafeAreaProvider>
  )
}
