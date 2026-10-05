import { useState } from 'react'
import { StyleSheet, View, Pressable } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import Constants from 'expo-constants'
import { usersApi } from '../../../src/api/users'
import { ConfirmDialog } from '../../../src/components/Dialog'
import { Screen } from '../../../src/components/Screen'
import { Avatar, Card, Divider, Icon, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { LANGUAGES, useI18n } from '../../../src/i18n'
import type { TranslationKey } from '../../../src/i18n/en'
import type { IconName } from '../../../src/lib/domain'
import { unregisterPush } from '../../../src/lib/push'
import { useAuth } from '../../../src/store/auth'
import { colors, radius, spacing } from '../../../src/theme'

interface MenuItem { icon: IconName; label: TranslationKey; href: Href; value?: string }

export default function ProfileScreen() {
  const { t, language } = useI18n()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const wards = useQuery(() => usersApi.wards().then((r) => r.items))
  const ward = wards.data?.find((w) => w.id === user?.ward_id)
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label

  const menu: MenuItem[] = [
    { icon: 'account-edit-outline', label: 'profile.editProfile', href: '/settings/edit' },
    { icon: 'clipboard-text-outline', label: 'profile.myComplaints', href: '/complaints' },
    { icon: 'translate', label: 'profile.language', href: '/settings/language', value: languageLabel },
    { icon: 'bell-outline', label: 'profile.notifications', href: '/notifications' },
    { icon: 'shield-lock-outline', label: 'profile.privacy', href: { pathname: '/settings/info', params: { topic: 'privacy' } } },
    { icon: 'lifebuoy', label: 'profile.help', href: { pathname: '/settings/info', params: { topic: 'help' } } },
    { icon: 'information-outline', label: 'profile.about', href: { pathname: '/settings/info', params: { topic: 'about' } } },
  ]

  const signOut = async () => {
    setConfirmLogout(false)
    await unregisterPush()
    await logout()
    router.replace('/login')
  }

  return (
    <Screen>
      <Text variant="h1" accessibilityRole="header">{t('profile.title')}</Text>

      <Card style={styles.identity}>
        <Avatar name={user?.name ?? null} size={72} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text variant="h2">{user?.name ?? t('profile.noName')}</Text>
          <Text variant="small" color={colors.textMuted}>{user?.phone ?? t('profile.noPhone')}</Text>
          {ward ? <Text variant="caption" color={colors.textFaint}>{t('profile.ward')}: {ward.name}</Text> : null}
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {menu.map((item, index) => (
          <View key={item.label}>
            {index > 0 ? <Divider /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t(item.label)} onPress={() => router.push(item.href)}
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.neutralBg }]}>
              <View style={styles.menuIcon}><Icon name={item.icon} size={20} color={colors.primary} /></View>
              <Text variant="h3" style={{ flex: 1 }}>{t(item.label)}</Text>
              {item.value ? <Text variant="small" color={colors.textMuted}>{item.value}</Text> : null}
              <Icon name="chevron-right" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
      </Card>

      <Pressable accessibilityRole="button" accessibilityLabel={t('profile.logout')} onPress={() => setConfirmLogout(true)} style={styles.logout}>
        <Icon name="logout" size={20} color={colors.danger} />
        <Text variant="h3" color={colors.danger}>{t('profile.logout')}</Text>
      </Pressable>
      <Text variant="caption" color={colors.textFaint} style={{ textAlign: 'center' }}>
        MyCityAI · {t('profile.version', { v: Constants.expoConfig?.version ?? '0.1.0' })}
      </Text>

      <ConfirmDialog visible={confirmLogout} destructive title={t('profile.logoutConfirm')} confirmLabel={t('profile.logout')} cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmLogout(false)} onConfirm={signOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg },
  menuIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.dangerBg },
})
