import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Complaint, PriorityLevel, Status, TimelineEvent } from '../api/types'
import { useI18n } from '../i18n'
import { CATEGORY_ICONS, PRIORITY_TONE, STATUS_TONE, categoryKey, priorityKey, statusKey } from '../lib/domain'
import { formatDate, formatDateTime, shortLocation } from '../lib/format'
import { colors, radius, spacing, toneColors } from '../theme'
import { Card, Icon, Pill, Text } from './ui'

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n()
  return <Pill label={t(statusKey(status))} tone={STATUS_TONE[status]} />
}

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  const { t } = useI18n()
  return <Pill label={t(priorityKey(level))} tone={PRIORITY_TONE[level]} icon={level === 'critical' ? 'alert' : undefined} />
}

export function ComplaintCard({ complaint }: { complaint: Complaint }) {
  const router = useRouter()
  const { t, language } = useI18n()
  const place = shortLocation(complaint.location.address, complaint.location.lat, complaint.location.lng)
  return (
    <Card
      onPress={() => router.push({ pathname: '/complaint/[id]', params: { id: String(complaint.id) } })}
      accessibilityLabel={`${complaint.code}, ${t(categoryKey(complaint.category))}, ${t(statusKey(complaint.status))}`}
      style={{ gap: spacing.md }}
    >
      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <View style={styles.catIcon}><Icon name={CATEGORY_ICONS[complaint.category]} color={colors.primary} size={20} /></View>
          <View style={{ flexShrink: 1 }}>
            <Text variant="h3" numberOfLines={1}>{t(categoryKey(complaint.category))}</Text>
            <Text variant="caption" color={colors.textMuted}>{complaint.code}</Text>
          </View>
        </View>
        <StatusBadge status={complaint.status} />
      </View>
      {complaint.description ? <Text variant="small" color={colors.textMuted} numberOfLines={2}>{complaint.description}</Text> : null}
      <View style={styles.rowBetween}>
        <View style={[styles.row, { flexShrink: 1 }]}>
          <Icon name="map-marker-outline" size={14} color={colors.textFaint} />
          <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Text>
        </View>
        <View style={styles.row}>
          <PriorityBadge level={complaint.priority_level} />
          <Text variant="caption" color={colors.textFaint}>{formatDate(complaint.created_at, language)}</Text>
        </View>
      </View>
    </Card>
  )
}

const TIMELINE_ICON = {
  created: 'file-document-edit-outline', classified: 'robot-outline', merged: 'call-merge', assigned: 'account-check-outline',
  status_changed: 'progress-wrench', escalated: 'arrow-up-bold-circle-outline', proof_uploaded: 'camera-outline',
  proof_verified: 'check-decagram-outline', feedback: 'star-outline', reopened: 'restart', comment: 'comment-text-outline',
  auto_reply: 'message-reply-text-outline',
} as const

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t, language } = useI18n()
  return (
    <View>
      {events.map((event, index) => {
        const last = index === events.length - 1
        const status = event.to_status
        const tone = status ? toneColors[STATUS_TONE[status]] : toneColors.info
        const known = event.type in TIMELINE_ICON
        const title = event.type === 'status_changed' && status ? t(statusKey(status)) : known ? t(`timeline.${event.type}` as 'timeline.created') : event.type
        return (
          <View key={event.id} style={styles.tlRow}>
            <View style={styles.tlRail}>
              <View style={[styles.tlDot, { backgroundColor: last ? tone.fg : tone.bg, borderColor: tone.fg }]}>
                <Icon name={TIMELINE_ICON[event.type as keyof typeof TIMELINE_ICON] ?? 'circle-small'} size={14} color={last ? '#FFFFFF' : tone.fg} />
              </View>
              {!last ? <View style={styles.tlLine} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg }}>
              <Text variant="h3">{title}</Text>
              <Text variant="caption" color={colors.textFaint}>
                {formatDateTime(event.created_at, language)}
                {event.actor?.name ? `  ·  ${t('detail.by', { name: event.actor.name })}` : ''}
              </Text>
              {event.note ? <Text variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>{event.note}</Text> : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  catIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tlRow: { flexDirection: 'row', gap: spacing.md },
  tlRail: { alignItems: 'center', width: 28 },
  tlDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
})
