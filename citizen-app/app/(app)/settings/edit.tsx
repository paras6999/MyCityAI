import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { usersApi } from '../../../src/api/users'
import { Screen } from '../../../src/components/Screen'
import { ScreenHeader } from '../../../src/components/ScreenHeader'
import { Skeleton, useToast } from '../../../src/components/feedback'
import { Banner, Button, Icon, Input, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { useI18n } from '../../../src/i18n'
import { errorMessage } from '../../../src/lib/domain'
import { useAuth } from '../../../src/store/auth'
import { colors, radius, spacing } from '../../../src/theme'

export default function EditProfileScreen() {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { user, updateProfile } = useAuth()
  const wards = useQuery(() => usersApi.wards().then((r) => r.items))
  const [name, setName] = useState(user?.name ?? '')
  const [wardId, setWardId] = useState<number | null>(user?.ward_id ?? null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return setNameError(t('auth.nameRequired'))
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ name: name.trim(), ...(wardId !== null ? { ward_id: wardId } : {}) })
      toast.show(t('profile.saved'), 'success')
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
      setSaving(false)
    }
  }

  return (
    <Screen keyboard footer={<Button label={t('common.save')} onPress={save} loading={saving} />}>
      <ScreenHeader title={t('profile.editProfile')} />
      {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}
      <Input label={t('auth.name')} value={name} onChangeText={(v) => { setName(v); setNameError(null) }} error={nameError} autoCapitalize="words" autoComplete="name" />
      <Input label={t('auth.phone')} value={user?.phone ?? ''} editable={false} style={{ backgroundColor: colors.neutralBg, color: colors.textMuted }} />
      <View style={{ gap: spacing.sm }}>
        <Text variant="small" color={colors.textMuted} style={{ fontWeight: '600' }}>{t('auth.ward')}</Text>
        {wards.loading ? <Skeleton height={52} radius={radius.md} /> : wards.data?.map((ward) => {
          const selected = ward.id === wardId
          return (
            <Pressable key={ward.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setWardId(ward.id)}
              style={[styles.ward, selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
              <Text variant="h3" style={{ flex: 1 }}>{ward.name}</Text>
              <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? colors.primary : colors.textFaint} />
            </Pressable>
          )
        })}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  ward: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
})
