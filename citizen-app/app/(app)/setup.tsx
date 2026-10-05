import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { usersApi } from '../../src/api/users'
import { Screen } from '../../src/components/Screen'
import { ErrorState, Skeleton } from '../../src/components/feedback'
import { Banner, Button, Icon, Input, Text } from '../../src/components/ui'
import { useQuery } from '../../src/hooks/useApi'
import { useI18n } from '../../src/i18n'
import { errorMessage } from '../../src/lib/domain'
import { useAuth } from '../../src/store/auth'
import { colors, radius, spacing } from '../../src/theme'

/** First sign-in: collect the name (if missing) and ward, saved with PATCH /auth/me (docs/API.md §4.1). */
export default function SetupScreen() {
  const { t } = useI18n()
  const router = useRouter()
  const { user, updateProfile } = useAuth()
  const wards = useQuery(() => usersApi.wards().then((r) => r.items))
  const [name, setName] = useState(user?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [wardId, setWardId] = useState<number | null>(user?.ward_id ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsName = !user?.name

  const finish = async (skipWard: boolean) => {
    if (needsName && !name.trim()) return setNameError(t('auth.nameRequired'))
    setSaving(true)
    setError(null)
    try {
      await updateProfile({
        ...(needsName ? { name: name.trim() } : {}),
        ...(!skipWard && wardId !== null ? { ward_id: wardId } : {}),
      })
      router.replace('/home')
    } catch (e) {
      setError(errorMessage(e, t))
      setSaving(false)
    }
  }

  return (
    <Screen keyboard contentStyle={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
      <View style={{ gap: spacing.sm }}>
        <Text variant="h1" accessibilityRole="header">{t('auth.setupTitle')}</Text>
        <Text color={colors.textMuted}>{t('auth.setupSubtitle')}</Text>
      </View>
      {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}
      {needsName ? <Input label={t('auth.name')} value={name} onChangeText={setName} error={nameError} autoCapitalize="words" autoComplete="name" /> : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="small" color={colors.textMuted} style={{ fontWeight: '600' }}>{t('auth.ward')}</Text>
        {wards.loading ? (
          <View style={{ gap: spacing.sm }}><Skeleton height={52} radius={radius.md} /><Skeleton height={52} radius={radius.md} /></View>
        ) : wards.error ? (
          <ErrorState message={errorMessage(wards.error, t)} onRetry={wards.reload} />
        ) : (
          wards.data?.map((ward) => {
            const selected = ward.id === wardId
            return (
              <Pressable key={ward.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setWardId(ward.id)}
                style={[styles.ward, selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
                <Text variant="h3" style={{ flex: 1 }}>{ward.name}</Text>
                <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} color={selected ? colors.primary : colors.textFaint} size={22} />
              </Pressable>
            )
          })
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label={t('auth.finish')} onPress={() => finish(false)} loading={saving} />
        <Button label={t('auth.skip')} variant="ghost" onPress={() => finish(true)} disabled={saving} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  ward: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
})
