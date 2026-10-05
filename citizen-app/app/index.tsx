import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ErrorState } from '../src/components/feedback'
import { Logo } from '../src/components/Logo'
import { Text } from '../src/components/ui'
import { useI18n } from '../src/i18n'
import { useAuth } from '../src/store/auth'
import { colors, spacing } from '../src/theme'

const MIN_SPLASH_MS = 1600

/** Splash: plays the intro, then routes to Home or Login depending on the stored session. */
export default function Splash() {
  const router = useRouter()
  const { t } = useI18n()
  const { status, bootError, retryBoot } = useAuth()
  const [minElapsed, setMinElapsed] = useState(false)
  const fade = useRef(new Animated.Value(0)).current
  const lift = useRef(new Animated.Value(14)).current
  const tagline = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
    Animated.timing(tagline, { toValue: 1, duration: 600, delay: 500, useNativeDriver: true }).start()
    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(timer)
  }, [fade, lift, tagline])

  useEffect(() => {
    if (!minElapsed || status === 'loading') return
    router.replace(status === 'signedIn' ? '/home' : '/login')
  }, [minElapsed, status, router])

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity: fade, transform: [{ translateY: lift }] }}>
        <Logo size={84} light />
      </Animated.View>
      <Animated.View style={{ opacity: tagline }}>
        <Text variant="body" color="#BFDBFE" style={{ textAlign: 'center' }}>{t('app.tagline')}</Text>
      </Animated.View>
      {bootError && minElapsed ? (
        <View style={styles.error}>
          <ErrorState message={t('common.offline')} onRetry={retryBoot} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  error: { position: 'absolute', bottom: spacing.xl, left: spacing.lg, right: spacing.lg, backgroundColor: colors.surface, borderRadius: 16, maxWidth: 420, alignSelf: 'center' },
})
