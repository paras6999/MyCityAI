import { announcementsApi } from '../../src/api/stats'
import { AnnouncementCard } from '../../src/components/AnnouncementCard'
import { Screen } from '../../src/components/Screen'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { EmptyState, ErrorState, ListSkeleton } from '../../src/components/feedback'
import { useQuery } from '../../src/hooks/useApi'
import { useI18n } from '../../src/i18n'
import { errorMessage } from '../../src/lib/domain'
import { View } from 'react-native'
import { spacing } from '../../src/theme'

/** Active announcements for the citizen's ward and city-wide (docs/API.md §7). Opened from Home and push taps. */
export default function AnnouncementsScreen() {
  const { t } = useI18n()
  const list = useQuery(() => announcementsApi.list().then((r) => r.items))
  return (
    <Screen refreshing={false} onRefresh={list.reload}>
      <ScreenHeader title={t('home.updates')} />
      {list.loading && !list.data ? <ListSkeleton count={3} />
        : list.error && !list.data ? <ErrorState message={errorMessage(list.error, t)} onRetry={list.reload} />
        : !list.data?.length ? <EmptyState icon="bullhorn-outline" title={t('home.updatesEmpty')} />
        : <View style={{ gap: spacing.md }}>{list.data.map((a) => <AnnouncementCard key={a.id} item={a} />)}</View>}
    </Screen>
  )
}
