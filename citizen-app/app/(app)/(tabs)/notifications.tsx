import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { AppNotification } from '../../../src/api/notifications'
import { Screen } from '../../../src/components/Screen'
import { EmptyState, ErrorState, ListSkeleton, useToast } from '../../../src/components/feedback'
import { Banner, Button, Icon, Text } from '../../../src/components/ui'
import { useI18n } from '../../../src/i18n'
import type { TranslationKey } from '../../../src/i18n/en'
import { STATUS_TONE, errorMessage, type IconName } from '../../../src/lib/domain'
import { timeAgo } from '../../../src/lib/format'
import { pushPermissionGranted, registerForPush } from '../../../src/lib/push'
import { useNotifications } from '../../../src/store/notifications'
import { colors, radius, spacing, toneColors, type Tone } from '../../../src/theme'
import { useEffect } from 'react'

const KIND: Record<string, { key: TranslationKey; icon: IconName; tone: Tone }> = {
  created: { key: 'notif.created', icon: 'file-document-check-outline', tone: 'info' },
  classified: { key: 'notif.classified', icon: 'robot-outline', tone: 'accent' },
  merged: { key: 'notif.merged', icon: 'call-merge', tone: 'neutral' },
  assigned: { key: 'notif.assigned', icon: 'account-check-outline', tone: STATUS_TONE.assigned },
  in_progress: { key: 'notif.in_progress', icon: 'progress-wrench', tone: STATUS_TONE.in_progress },
  resolved: { key: 'notif.resolved', icon: 'check-circle-outline', tone: 'success' },
  closed: { key: 'notif.closed', icon: 'check-all', tone: 'success' },
  reopened: { key: 'notif.reopened', icon: 'restart', tone: 'danger' },
  rejected: { key: 'notif.rejected', icon: 'close-circle-outline', tone: 'neutral' },
  escalated: { key: 'notif.escalated', icon: 'arrow-up-bold-circle-outline', tone: 'warning' },
}
const FALLBACK = { key: 'notif.generic' as TranslationKey, icon: 'bell-outline' as IconName, tone: 'info' as Tone }

export default function NotificationsScreen() {
  const { t, language } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { items, readIds, unreadCount, loading, error, reload, markRead, markAllRead } = useNotifications()
  const [pushOff, setPushOff] = useState(false)

  useEffect(() => { void pushPermissionGranted().then((granted) => setPushOff(!granted)) }, [])

  const open = (n: AppNotification) => {
    markRead(n.id)
    router.push({ pathname: '/complaint/[id]', params: { id: String(n.complaintId) } })
  }
  const enablePush = async () => {
    const ok = await registerForPush(true)
    setPushOff(!ok)
    if (!ok) toast.show(t('notif.pushOff'), 'warning')
  }

  return (
    <Screen refreshing={loading && items.length > 0} onRefresh={reload}>
      <View style={styles.titleRow}>
        <Text variant="h1" accessibilityRole="header">{t('notif.title')}</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} accessibilityRole="button" hitSlop={8}>
            <Text variant="small" color={colors.primary} style={{ fontWeight: '700' }}>{t('notif.markAll')}</Text>
          </Pressable>
        ) : null}
      </View>

      {pushOff && Platform.OS !== 'web' ? (
        <Banner tone="info" icon="bell-ring-outline">
          <Text variant="small" color={colors.primaryDark}>{t('notif.pushOff')}</Text>
          <Button label={t('notif.enable')} variant="secondary" onPress={enablePush} style={{ marginTop: spacing.sm, minHeight: 40, alignSelf: 'flex-start' }} />
        </Banner>
      ) : null}

      {loading && items.length === 0 ? <ListSkeleton count={4} />
        : error && items.length === 0 ? <ErrorState message={errorMessage(error, t)} onRetry={reload} />
        : items.length === 0 ? <EmptyState icon="bell-check-outline" title={t('notif.empty')} body={t('notif.emptyBody')} />
        : (
          <View style={{ gap: spacing.sm }}>
            {items.map((n) => {
              const kind = KIND[n.kind] ?? FALLBACK
              const tone = toneColors[kind.tone]
              const unread = !readIds.has(n.id)
              return (
                <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${t(kind.key, { code: n.code })}${unread ? '' : ''}`} onPress={() => open(n)}
                  style={({ pressed }) => [styles.item, unread && styles.unread, pressed && { opacity: 0.9 }]}>
                  <View style={[styles.icon, { backgroundColor: tone.bg }]}><Icon name={kind.icon} size={20} color={tone.fg} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="small" style={{ fontWeight: unread ? '700' : '400' }}>{t(kind.key, { code: n.code })}</Text>
                    <Text variant="caption" color={colors.textFaint}>{timeAgo(n.createdAt, language)}</Text>
                  </View>
                  {unread ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
                </Pressable>
              )
            })}
          </View>
        )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  unread: { backgroundColor: '#F5F9FF', borderColor: colors.primaryLight },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
})
