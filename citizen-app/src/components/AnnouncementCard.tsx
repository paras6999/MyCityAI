import { View } from 'react-native'
import type { Announcement } from '../api/types'
import { useI18n } from '../i18n'
import { formatDateTime, localized } from '../lib/format'
import { colors, spacing, toneColors } from '../theme'
import { Card, Pill, Text } from './ui'

const TONE = { emergency: 'danger', important: 'warning', general: 'success' } as const

/** One announcement in the citizen's language (docs/API.md §3.9), coloured by priority. */
export function AnnouncementCard({ item }: { item: Announcement }) {
  const { t, language } = useI18n()
  const tone = TONE[item.priority] ?? 'success'
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: toneColors[tone].fg, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill label={t(`ann.${item.priority}`)} tone={tone} />
        {item.valid_until ? <Text variant="caption" color={colors.textFaint}>{t('ann.until', { time: formatDateTime(item.valid_until, language) })}</Text> : null}
      </View>
      <Text variant="h3">{localized(item.title, language)}</Text>
      <Text variant="small" color={colors.textMuted}>{localized(item.message, language)}</Text>
    </Card>
  )
}
