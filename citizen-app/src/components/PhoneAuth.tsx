import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { useI18n } from '../i18n'
import { errorMessage } from '../lib/domain'
import { useAuth } from '../store/auth'
import { colors, spacing } from '../theme'
import { Banner, Button, Input, Text } from './ui'
import { Logo } from './Logo'
import { Screen } from './Screen'

const PHONE_PATTERN = /^\+[1-9]\d{9,14}$/ // same rule as the backend (schemas/auth.py)
export const normalizePhone = (raw: string) => raw.replace(/[\s\-()]/g, '')

/** Login and Create account share one form: the backend signs citizens in by phone + one-time code. */
export function PhoneAuth({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n()
  const router = useRouter()
  const { setPendingName } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+91 ')
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const register = mode === 'register'

  const submit = async () => {
    const normalized = normalizePhone(phone)
    const next = {
      name: register && !name.trim() ? t('auth.nameRequired') : undefined,
      phone: PHONE_PATTERN.test(normalized) ? undefined : t('auth.phoneInvalid'),
    }
    setErrors(next)
    setApiError(null)
    if (next.name || next.phone) return

    setLoading(true)
    try {
      await authApi.requestOtp(normalized)
    } catch (error) {
      // 429: a code was sent less than 30 s ago, so it is still valid. Continue to the code screen.
      if (!(error instanceof ApiError && error.code === 'RATE_LIMITED')) {
        setApiError(errorMessage(error, t))
        setLoading(false)
        return
      }
    }
    setLoading(false)
    if (register) setPendingName(name)
    router.push({ pathname: '/otp', params: { phone: normalized } })
  }

  return (
    <Screen keyboard contentStyle={styles.content}>
      <View style={{ alignItems: 'center', marginTop: spacing.xl }}><Logo size={56} /></View>
      <View style={{ gap: spacing.sm }}>
        <Text variant="h1" accessibilityRole="header">{register ? t('auth.registerTitle') : t('auth.loginTitle')}</Text>
        <Text color={colors.textMuted}>{register ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</Text>
      </View>

      {apiError ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{apiError}</Text></Banner> : null}

      <View style={{ gap: spacing.lg }}>
        {register ? (
          <Input label={t('auth.name')} value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
        ) : null}
        <Input
          label={t('auth.phone')} value={phone} onChangeText={setPhone} error={errors.phone} hint={t('auth.phoneHint')}
          keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" onSubmitEditing={submit} returnKeyType="go"
        />
      </View>

      <Button label={t('auth.sendOtp')} onPress={submit} loading={loading} />

      {!register ? (
        <Pressable onPress={() => setShowHelp((v) => !v)} accessibilityRole="button" style={{ alignSelf: 'center' }}>
          <Text variant="small" color={colors.primary} style={{ fontWeight: '600' }}>{t('auth.forgot')}</Text>
        </Pressable>
      ) : null}
      {showHelp ? <Banner tone="info" icon="information-outline"><Text variant="small" color={colors.primaryDark}>{t('auth.forgotInfo')}</Text></Banner> : null}

      <View style={styles.switchRow}>
        <Text variant="small" color={colors.textMuted}>{register ? t('auth.haveAccount') : t('auth.noAccount')}</Text>
        <Pressable onPress={() => router.replace(register ? '/login' : '/register')} accessibilityRole="link" hitSlop={8}>
          <Text variant="small" color={colors.primary} style={{ fontWeight: '700' }}>{register ? t('auth.signIn') : t('auth.createAccount')}</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.xl },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
})
