import { StyleSheet, View } from 'react-native'
import { statsApi, type PublicStats } from '../../src/api/stats'
import { Screen } from '../../src/components/Screen'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { EmptyState, ErrorState, Skeleton } from '../../src/components/feedback'
import { Card, Icon, SectionHeader, Text } from '../../src/components/ui'
import { useQuery } from '../../src/hooks/useApi'
import { useI18n } from '../../src/i18n'
import { errorMessage } from '../../src/lib/domain'
import { colors, radius, spacing, toneColors } from '../../src/theme'

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`
const hours = (h: number | null) => (h === null ? '—' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`)

/** Public city numbers (docs/API.md §8): no personal data, no login needed. */
export default function CityStatsScreen() {
  const { t } = useI18n()
  const stats = useQuery(() => statsApi.public())
  const data = stats.data

  return (
    <Screen refreshing={false} onRefresh={stats.reload}>
      <ScreenHeader title={t('stats.title')} />
      {stats.loading && !data ? <StatsSkeleton />
        : stats.error && !data ? <ErrorState message={errorMessage(stats.error, t)} onRetry={stats.reload} />
        : data && data.total_complaints === 0 ? <EmptyState icon="chart-box-outline" title={t('stats.empty')} body={t('stats.emptyBody')} />
        : data ? <StatsBody data={data} /> : null}
    </Screen>
  )
}

function StatsBody({ data }: { data: PublicStats }) {
  const { t } = useI18n()
  const tiles = [
    { label: t('stats.total'), value: String(data.total_complaints), icon: 'file-document-multiple-outline', tone: 'info' },
    { label: t('stats.resolved'), value: String(data.resolved), icon: 'check-circle-outline', tone: 'success' },
    { label: t('stats.pending'), value: String(data.pending), icon: 'clock-outline', tone: 'warning' },
    { label: t('stats.rate'), value: pct(data.resolution_rate), icon: 'percent-outline', tone: 'accent' },
    { label: t('stats.avgTime'), value: hours(data.avg_resolution_hours), icon: 'timer-sand', tone: 'neutral' },
    { label: t('stats.satisfaction'), value: data.satisfaction_avg === null ? '—' : `${data.satisfaction_avg.toFixed(1)}/5`, icon: 'star-outline', tone: 'warning' },
  ] as const
  const maxMonth = Math.max(1, ...data.monthly.flatMap((m) => [m.received, m.resolved]))

  return (
    <>
      <Text variant="caption" color={colors.textMuted}>{t('stats.period', { period: data.period })}</Text>
      <View style={styles.grid}>
        {tiles.map((tile) => {
          const tone = toneColors[tile.tone]
          return (
            <Card key={tile.label} style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: tone.bg }]}><Icon name={tile.icon} size={18} color={tone.fg} /></View>
              <Text variant="h2">{tile.value}</Text>
              <Text variant="caption" color={colors.textMuted}>{tile.label}</Text>
            </Card>
          )
        })}
      </View>

      <View>
        <SectionHeader title={t('stats.monthly')} />
        <Card style={{ gap: spacing.md }}>
          <View style={styles.legend}>
            <Legend color={colors.primary} label={t('stats.received')} />
            <Legend color={colors.success} label={t('stats.resolvedLegend')} />
          </View>
          <View style={styles.bars}>
            {data.monthly.map((m) => (
              <View key={m.month} style={styles.barGroup} accessibilityLabel={`${m.month}: ${m.received} / ${m.resolved}`}>
                <View style={styles.barPair}>
                  <View style={[styles.bar, { height: Math.max(2, (m.received / maxMonth) * 100), backgroundColor: colors.primary }]} />
                  <View style={[styles.bar, { height: Math.max(2, (m.resolved / maxMonth) * 100), backgroundColor: colors.success }]} />
                </View>
                <Text variant="caption" color={colors.textFaint}>{m.month.slice(5)}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader title={t('stats.byDepartment')} />
        <Card style={{ gap: spacing.lg }}>
          {data.by_department.map((d) => (
            <View key={d.department} style={{ gap: 6 }}>
              <View style={styles.rowBetween}>
                <Text variant="small" style={{ fontWeight: '600' }}>{t(`dept.${d.department}`)}</Text>
                <Text variant="small" color={colors.textMuted}>{pct(d.resolution_rate)} · {d.total}</Text>
              </View>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(d.resolution_rate * 100)}%` }]} /></View>
            </View>
          ))}
        </Card>
      </View>

      {data.top_wards.length ? (
        <View>
          <SectionHeader title={t('stats.topWards')} />
          <Card style={{ gap: spacing.md }}>
            {data.top_wards.map((w, index) => (
              <View key={w.ward_id} style={styles.rowBetween}>
                <View style={styles.row}>
                  <View style={styles.rank}><Text variant="caption" color={colors.primaryDark}>{index + 1}</Text></View>
                  <Text variant="small" style={{ fontWeight: '600' }}>{w.name}</Text>
                </View>
                <Text variant="small" color={colors.textMuted}>{pct(w.resolution_rate)} · {w.resolved}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.row}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" color={colors.textMuted}>{label}</Text>
    </View>
  )
}

function StatsSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.grid}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={96} radius={radius.lg} width="47%" />)}</View>
      <Skeleton height={170} radius={radius.lg} />
      <Skeleton height={150} radius={radius.lg} />
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '30%', gap: spacing.xs, padding: spacing.md },
  tileIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: spacing.lg },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 130 },
  barGroup: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 100 },
  bar: { width: 8, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  rank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
})
