import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { complaintsApi } from '../../../src/api/complaints'
import type { Complaint } from '../../../src/api/types'
import { AnnouncementCard } from '../../../src/components/AnnouncementCard'
import { ComplaintCard } from '../../../src/components/complaint'
import { Screen } from '../../../src/components/Screen'
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '../../../src/components/feedback'
import { Avatar, Button, Card, Icon, IconButton, SectionHeader, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { useI18n } from '../../../src/i18n'
import { localized } from '../../../src/lib/format'
import { ISSUE_TYPES, errorMessage, groupOf } from '../../../src/lib/domain'
import { useAuth } from '../../../src/store/auth'
import { useNotifications } from '../../../src/store/notifications'
import { colors, radius, shadow, spacing, toneColors } from '../../../src/theme'


function useGreeting() {
  const { t } = useI18n()
  const hour = new Date().getHours()
  return hour < 12 ? t('home.goodMorning') : hour < 17 ? t('home.goodAfternoon') : t('home.goodEvening')
}

export default function HomeScreen() {
  const { t } = useI18n()
  const router = useRouter()
  const { user } = useAuth()
  const { unreadCount } = useNotifications()
  const greeting = useGreeting()

  const home = useQuery(() => complaintsApi.home())
  // The backend has no stats endpoint, so the counts come from the citizen's own list (max page size).
  const all = useQuery(() => complaintsApi.list({ page_size: 100 }))
  const reloadHome = home.reload
  const reloadAll = all.reload
  useFocusEffect(useCallback(() => { void reloadHome(); void reloadAll() }, [reloadHome, reloadAll]))

  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([home.reload(), all.reload()])
    setRefreshing(false)
  }

  const counts = { pending: 0, progress: 0, resolved: 0 }
  for (const c of all.data?.items ?? []) {
    const group = groupOf(c.status)
    if (group !== 'other') counts[group]++
  }
  const stats = [
    { label: t('home.total'), value: all.data?.total ?? 0, icon: 'file-document-multiple-outline', tone: 'info' },
    { label: t('home.pending'), value: counts.pending, icon: 'clock-outline', tone: 'warning' },
    { label: t('home.inProgress'), value: counts.progress, icon: 'progress-wrench', tone: 'accent' },
    { label: t('home.resolved'), value: counts.resolved, icon: 'check-circle-outline', tone: 'success' },
  ] as const

  const startReport = (type?: string) =>
    router.push(type ? { pathname: '/report', params: { type } } : '/report')

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('nav.profile')} onPress={() => router.push('/profile')} style={styles.who}>
          <Avatar name={user?.name ?? null} />
          <View style={{ flexShrink: 1 }}>
            <Text variant="small" color={colors.textMuted}>{greeting}</Text>
            <Text variant="h2" numberOfLines={1}>{user?.name ?? t('home.citizen')}</Text>
          </View>
        </Pressable>
        <IconButton icon="bell-outline" label={t('nav.notifications')} badge={unreadCount > 0} onPress={() => router.push('/notifications')} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Icon name="bullhorn-outline" size={26} color="#FFFFFF" /></View>
        <Text variant="h2" color="#FFFFFF">{t('home.heroTitle')}</Text>
        <Text color="#DBEAFE">{t('home.heroBody')}</Text>
        <Button label={t('home.heroCta')} icon="camera-outline" onPress={() => startReport()} style={styles.heroButton} variant="secondary" />
      </View>

      <View>
        <SectionHeader title={t('home.quickActions')} />
        <View style={styles.quickGrid}>
          {ISSUE_TYPES.filter((i) => i.type !== 'other').map((issue) => (
            <Pressable key={issue.type} accessibilityRole="button" accessibilityLabel={t(`cat.${issue.type}`)} onPress={() => startReport(issue.type)}
              style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}>
              <View style={styles.quickIcon}><Icon name={issue.icon} size={24} color={colors.primary} /></View>
              <Text variant="caption" style={{ textAlign: 'center', fontSize: 11 }} numberOfLines={2}>{t(`cat.${issue.type}`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title={t('home.activity')} />
        <View style={styles.statGrid}>
          {stats.map((stat) => {
            const tone = toneColors[stat.tone]
            return (
              <Card key={stat.label} style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: tone.bg }]}><Icon name={stat.icon} size={18} color={tone.fg} /></View>
                {all.loading && !all.data ? <Skeleton width={36} height={26} /> : <Text variant="h1">{stat.value}</Text>}
                <Text variant="caption" color={colors.textMuted}>{stat.label}</Text>
              </Card>
            )
          })}
        </View>
      </View>

      <View>
        <SectionHeader title={t('home.recent')} action={t('common.viewAll')} onAction={() => router.push('/complaints')} />
        <RecentList loading={home.loading && !home.data} error={home.error} items={home.data?.recent_complaints} onRetry={home.reload} onReport={() => startReport()} />
      </View>

      <Card onPress={() => router.push('/stats')} accessibilityLabel={t('stats.title')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={styles.quickIcon}><Icon name="chart-box-outline" size={24} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{t('stats.title')}</Text>
          <Text variant="small" color={colors.textMuted}>{t('stats.homeBody')}</Text>
        </View>
        <Icon name="chevron-right" size={20} color={colors.textFaint} />
      </Card>

      <View>
        <SectionHeader title={t('home.updates')} action={t('common.viewAll')} onAction={() => router.push('/announcements')} />
        {home.data?.announcements.length ? (
          <View style={{ gap: spacing.md }}>{home.data.announcements.map((a) => <AnnouncementCard key={a.id} item={a} />)}</View>
        ) : (
          <Card><Text variant="small" color={colors.textMuted}>{t('home.updatesEmpty')}</Text></Card>
        )}
      </View>
    </Screen>
  )
}

function RecentList({ loading, error, items, onRetry, onReport }: { loading: boolean; error: Error | null; items?: Complaint[]; onRetry: () => void; onReport: () => void }) {
  const { t } = useI18n()
  if (loading) return <ListSkeleton count={2} />
  if (error) return <Card><ErrorState message={errorMessage(error, t)} onRetry={onRetry} /></Card>
  if (!items?.length) {
    return <Card><EmptyState icon="clipboard-text-outline" title={t('complaints.empty')} body={t('complaints.emptyBody')} actionLabel={t('home.heroCta')} onAction={onReport} /></Card>
  }
  return <View style={{ gap: spacing.md }}>{items.map((c) => <ComplaintCard key={c.id} complaint={c} />)}</View>
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, ...shadow.card },
  heroIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  heroButton: { marginTop: spacing.md, backgroundColor: '#FFFFFF' },
  quickGrid: { flexDirection: 'row', gap: spacing.sm },
  quick: { flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: 2, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: '45%', gap: spacing.xs, padding: spacing.lg },
  statIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
})
