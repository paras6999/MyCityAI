import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ApiError, mediaUrl } from '../../../src/api/client'
import { complaintsApi } from '../../../src/api/complaints'
import type { Status } from '../../../src/api/types'
import { PriorityBadge, StatusBadge, Timeline } from '../../../src/components/complaint'
import { Screen } from '../../../src/components/Screen'
import { ScreenHeader } from '../../../src/components/ScreenHeader'
import { ErrorState, Skeleton } from '../../../src/components/feedback'
import { FeedbackCard, ProofCard } from '../../../src/components/Resolution'
import { LocationMap } from '../../../src/components/map/LocationMap'
import { Banner, Button, Card, Icon, SectionHeader, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { useI18n } from '../../../src/i18n'
import { CATEGORY_ICONS, categoryKey, errorMessage } from '../../../src/lib/domain'
import { formatCoords, formatDateTime } from '../../../src/lib/format'
import { colors, radius, spacing } from '../../../src/theme'

const TRACK: { status: Status; reached: Status[] }[] = [
  { status: 'new', reached: ['new', 'merged', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened'] },
  { status: 'assigned', reached: ['assigned', 'in_progress', 'resolved', 'closed'] },
  { status: 'in_progress', reached: ['in_progress', 'resolved', 'closed'] },
  { status: 'resolved', reached: ['resolved', 'closed'] },
]

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, language } = useI18n()
  const router = useRouter()
  const complaintId = Number(id)
  const detail = useQuery(() => complaintsApi.detail(complaintId), [complaintId])
  const timeline = useQuery(() => complaintsApi.timeline(complaintId).then((r) => r.items), [complaintId])
  const [refreshing, setRefreshing] = useState(false)
  const complaint = detail.data

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([detail.reload(), timeline.reload()])
    setRefreshing(false)
  }

  const notFound = detail.error instanceof ApiError && (detail.error.status === 404 || detail.error.status === 403)
  const photo = mediaUrl(complaint?.photo_url)

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader title={complaint ? t('detail.title', { code: complaint.code }) : t('detail.title', { code: '…' })} />

      {detail.loading && !complaint ? <DetailSkeleton />
        : detail.error && !complaint ? <ErrorState message={notFound ? t('detail.notAvailable') : errorMessage(detail.error, t)} onRetry={notFound ? undefined : detail.reload} />
        : complaint ? (
          <>
            <View style={styles.statusRow}>
              <StatusBadge status={complaint.status} />
              <PriorityBadge level={complaint.priority_level} />
            </View>

            {complaint.merged_into_id ? (
              <Banner tone="info" icon="call-merge">
                <Text variant="small" color={colors.primaryDark}>{t('detail.mergedInto')}</Text>
                <Button label={t('detail.openOriginal')} variant="secondary" style={styles.inlineButton}
                  onPress={() => router.push({ pathname: '/complaint/[id]', params: { id: String(complaint.merged_into_id) } })} />
              </Banner>
            ) : null}

            <ProgressTrack status={complaint.status} />

            <View>
              <SectionHeader title={t('detail.photo')} />
              {photo ? <Image source={{ uri: photo }} style={styles.photo} accessibilityLabel={t('detail.photo')} />
                : <View style={[styles.photo, styles.noPhoto]}><Icon name="image-off-outline" size={32} color={colors.textFaint} /></View>}
            </View>

            <View>
              <SectionHeader title={t('detail.info')} />
              <Card style={{ gap: spacing.lg }}>
                <InfoRow icon={CATEGORY_ICONS[complaint.category]} label={t('detail.category')} value={t(categoryKey(complaint.category))} />
                {complaint.description ? <InfoRow icon="text-box-outline" label={t('detail.description')} value={complaint.description} /> : null}
                <InfoRow icon="calendar-outline" label={t('detail.date')} value={formatDateTime(complaint.created_at, language)} />
                <InfoRow icon="map-marker-outline" label={t('detail.location')} value={complaint.location.address || formatCoords(complaint.location.lat, complaint.location.lng)} />
                <InfoRow icon="office-building-outline" label={t('detail.department')} value={t(`dept.${complaint.department}`)} />
                {complaint.assigned_to?.name ? <InfoRow icon="account-check-outline" label={t('detail.assignee')} value={complaint.assigned_to.name} /> : null}
                {!['resolved', 'closed', 'rejected', 'merged'].includes(complaint.status) ? (
                  <InfoRow icon="clock-check-outline" label={t('detail.sla')} value={formatDateTime(complaint.sla_due_at, language)} />
                ) : null}
                {complaint.duplicate_count > 0 ? <InfoRow icon="account-group-outline" label="" value={t('detail.reports', { n: complaint.duplicate_count + 1 })} /> : null}
              </Card>
            </View>

            {complaint.ai && (complaint.ai.summary || complaint.ai.category_confidence != null) ? (
              <View>
                <SectionHeader title={t('detail.ai')} />
                <Card style={{ backgroundColor: colors.accentLight, borderColor: '#DDD6FE', gap: spacing.sm }}>
                  <View style={styles.aiHeader}>
                    <Icon name="robot-outline" size={18} color={colors.accent} />
                    {complaint.ai.category_confidence != null ? (
                      <Text variant="small" color={colors.accent} style={{ fontWeight: '700' }}>{t('report.aiConfidence')}: {Math.round(complaint.ai.category_confidence * 100)}%</Text>
                    ) : null}
                  </View>
                  {complaint.ai.summary ? <Text variant="small">{complaint.ai.summary}</Text> : null}
                </Card>
              </View>
            ) : null}

            <ProofCard complaint={complaint} />
            <FeedbackCard complaint={complaint} onUpdated={refresh} />

            <View>
              <SectionHeader title={t('detail.timeline')} />
              <Card>
                {timeline.loading && !timeline.data ? <View style={{ gap: spacing.lg }}><Skeleton height={36} /><Skeleton height={36} /><Skeleton height={36} /></View>
                  : timeline.error && !timeline.data ? <ErrorState message={errorMessage(timeline.error, t)} onRetry={timeline.reload} />
                  : timeline.data?.length ? <Timeline events={timeline.data} />
                  : <Text variant="small" color={colors.textMuted}>{t('detail.timelineEmpty')}</Text>}
              </Card>
            </View>

            <View>
              <SectionHeader title={t('detail.map')} />
              <LocationMap pin={{ lat: complaint.location.lat, lng: complaint.location.lng }} height={220} />
            </View>
          </>
        ) : null}
    </Screen>
  )
}

function ProgressTrack({ status }: { status: Status }) {
  const { t } = useI18n()
  if (status === 'rejected') return null
  return (
    <Card style={styles.track}>
      {TRACK.map((step, index) => {
        const done = step.reached.includes(status)
        return (
          <View key={step.status} style={styles.trackStep}>
            <View style={styles.trackLineRow}>
              <View style={[styles.trackLine, index === 0 && { opacity: 0 }, done && { backgroundColor: colors.primary }]} />
              <View style={[styles.trackDot, done && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {done ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={[styles.trackLine, index === TRACK.length - 1 && { opacity: 0 }, TRACK[index + 1]?.reached.includes(status) && { backgroundColor: colors.primary }]} />
            </View>
            <Text variant="caption" color={done ? colors.text : colors.textFaint} style={{ textAlign: 'center' }} numberOfLines={2}>
              {t(step.status === 'new' ? 'timeline.created' : `status.${step.status}`)}
            </Text>
          </View>
        )
      })}
    </Card>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        {label ? <Text variant="caption" color={colors.textMuted}>{label}</Text> : null}
        <Text style={{ fontWeight: '500' }}>{value}</Text>
      </View>
    </View>
  )
}

function DetailSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Skeleton width={160} height={26} radius={radius.pill} />
      <Skeleton height={80} radius={radius.lg} />
      <Skeleton height={200} radius={radius.lg} />
      <Skeleton height={180} radius={radius.lg} />
    </View>
  )
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  inlineButton: { minHeight: 40, marginTop: spacing.sm, alignSelf: 'flex-start' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.border },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flexDirection: 'row', paddingVertical: spacing.lg, paddingHorizontal: spacing.sm },
  trackStep: { flex: 1, alignItems: 'center', gap: spacing.sm },
  trackLineRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  trackLine: { flex: 1, height: 3, backgroundColor: colors.border },
  trackDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
})
