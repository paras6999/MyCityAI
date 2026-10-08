import { View } from 'react-native'
import type { Announcement } from '../api/types'
import { useI18n } from '../i18n'
import { formatDateTime, localized } from '../lib/format'
import { colors, radius, spacing, toneColors } from '../theme'
import { Icon, Pill, Text } from './ui'

const TONE = { emergency: 'danger', important: 'warning', general: 'success' } as const

/** One announcement in the citizen's language (docs/API.md §3.9), as a banner coloured by priority. */
export function AnnouncementCard({ item }: { item: Announcement }) {
  const { t, language } = useI18n()
  const tone = TONE[item.priority] ?? 'success'
  const { fg, bg } = toneColors[tone]
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: fg, backgroundColor: bg }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={item.priority === 'emergency' ? 'alert-octagon-outline' : 'bullhorn-outline'} size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill label={t(`ann.${item.priority}`)} tone={tone} />
          {item.valid_until ? <Text variant="caption" color={colors.textMuted}>{t('ann.until', { time: formatDateTime(item.valid_until, language) })}</Text> : null}
        </View>
        <Text variant="h3" color={fg}>{localized(item.title, language)}</Text>
        <Text variant="small">{localized(item.message, language)}</Text>
      </View>
    </View>
  )
}
