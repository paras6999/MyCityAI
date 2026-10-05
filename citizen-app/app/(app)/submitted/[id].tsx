import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { complaintsApi } from '../../../src/api/complaints'
import { StatusBadge } from '../../../src/components/complaint'
import { Screen } from '../../../src/components/Screen'
import { ErrorState, Skeleton } from '../../../src/components/feedback'
import { Banner, Button, Card, Icon, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { useI18n } from '../../../src/i18n'
import { categoryKey, errorMessage } from '../../../src/lib/domain'
import { formatCoords } from '../../../src/lib/format'
import { colors, radius, spacing } from '../../../src/theme'

export default function SubmittedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useI18n()
  const router = useRouter()
  const { data: complaint, loading, error, reload } = useQuery(() => complaintsApi.detail(Number(id)), [id])
  const scale = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start()
  }, [scale])

  const footer = (
    <>
      <Button label={t('report.track')} onPress={() => router.replace({ pathname: '/complaint/[id]', params: { id: String(id) } })} />
      <Button label={t('report.backHome')} variant="ghost" onPress={() => router.replace('/home')} />
    </>
  )

  return (
    <Screen footer={footer} contentStyle={{ alignItems: 'stretch', paddingTop: spacing.xxl }}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Animated.View style={[styles.check, { transform: [{ scale }] }]}><Icon name="check" size={44} color="#FFFFFF" /></Animated.View>
        <Text variant="h1" style={{ textAlign: 'center' }} accessibilityRole="header">{t('report.successTitle')}</Text>
        <Text color={colors.textMuted} style={{ textAlign: 'center' }}>{t('report.successBody')}</Text>
      </View>

      {loading && !complaint ? <Skeleton height={150} radius={radius.lg} />
        : error ? <ErrorState message={errorMessage(error, t)} onRetry={reload} />
        : complaint ? (
          <>
            {complaint.merged_into_id ? <Banner tone="info" icon="call-merge"><Text variant="small" color={colors.primaryDark}>{t('report.mergedNote')}</Text></Banner> : null}
            <Card style={{ gap: spacing.lg }}>
              <Row label={t('detail.id')} value={complaint.code} strong />
              <Row label={t('detail.category')} value={t(categoryKey(complaint.category))} />
              <Row label={t('detail.location')} value={complaint.location.address || formatCoords(complaint.location.lat, complaint.location.lng)} />
              <View style={styles.row}>
                <Text variant="small" color={colors.textMuted}>{t('detail.status')}</Text>
                <StatusBadge status={complaint.status} />
              </View>
            </Card>
          </>
        ) : null}
    </Screen>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="small" color={colors.textMuted}>{label}</Text>
      <Text style={{ fontWeight: strong ? '700' : '500', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
})
