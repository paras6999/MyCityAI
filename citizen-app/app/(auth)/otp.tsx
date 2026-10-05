import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { authApi } from '../../src/api/auth'
import { ApiError } from '../../src/api/client'
import { Screen } from '../../src/components/Screen'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { useToast } from '../../src/components/feedback'
import { Banner, Button, Text } from '../../src/components/ui'
import { useI18n } from '../../src/i18n'
import { errorMessage } from '../../src/lib/domain'
import { useAuth } from '../../src/store/auth'
import { colors, radius, spacing } from '../../src/theme'

const RESEND_SECONDS = 30 // backend rate limit, docs/API.md §4.1

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>()
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { verifyOtp } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const submit = useCallback(
    async (value: string) => {
      if (!/^\d{6}$/.test(value)) return setError(t('auth.otpInvalid'))
      setLoading(true)
      setError(null)
      try {
        const result = await verifyOtp(phone, value)
        router.replace(result.is_new_user || !result.user.name ? '/setup' : '/home')
      } catch (e) {
        setError(errorMessage(e, t))
        if (e instanceof ApiError && e.code === 'OTP_INVALID') setCode('')
        setLoading(false)
      }
    },
    [phone, router, t, verifyOtp],
  )

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void submit(digits)
  }

  const resend = async () => {
    try {
      await authApi.requestOtp(phone)
      setCooldown(RESEND_SECONDS)
      setError(null)
      toast.show(t('auth.otpSent'), 'success')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RATE_LIMITED') setCooldown(RESEND_SECONDS)
      setError(errorMessage(e, t))
    }
  }

  return (
    <Screen keyboard contentStyle={{ gap: spacing.xl }}>
      <ScreenHeader title="" onBack={() => router.back()} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="h1" accessibilityRole="header">{t('auth.otpTitle')}</Text>
        <Text color={colors.textMuted}>{t('auth.otpSubtitle', { phone })}</Text>
      </View>

      <TextInput
        value={code} onChangeText={onChange} autoFocus maxLength={6} keyboardType="number-pad"
        textContentType="oneTimeCode" autoComplete="sms-otp" accessibilityLabel={t('auth.otpTitle')}
        placeholder="••••••" placeholderTextColor={colors.textFaint} editable={!loading}
        style={[styles.code, !!error && { borderColor: colors.danger }]}
      />
      {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}

      <Button label={t('auth.verify')} onPress={() => submit(code)} loading={loading} disabled={code.length !== 6} />

      <View style={styles.links}>
        {cooldown > 0 ? (
          <Text variant="small" color={colors.textFaint}>{t('auth.resendIn', { s: cooldown })}</Text>
        ) : (
          <Pressable onPress={resend} accessibilityRole="button" hitSlop={8}>
            <Text variant="small" color={colors.primary} style={{ fontWeight: '700' }}>{t('auth.resend')}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text variant="small" color={colors.textMuted}>{t('auth.changeNumber')}</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  code: {
    height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    textAlign: 'center', fontSize: 28, letterSpacing: 14, color: colors.text, fontWeight: '700',
  },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
