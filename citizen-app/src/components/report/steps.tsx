import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { complaintsApi } from '../../api/complaints'
import type { AnalyzeResult } from '../../api/types'
import { useI18n } from '../../i18n'
import { CATEGORY_ICONS, ISSUE_TYPES, categoryKey, errorMessage, priorityKey, PRIORITY_TONE } from '../../lib/domain'
import { formatCoords, localized } from '../../lib/format'
import { LocationError, getCurrentFix, reverseAddress } from '../../lib/location'
import { PHOTO_MAX_MB, PhotoError, takePhoto } from '../../lib/photo'
import { useReport } from '../../store/report'
import { colors, radius, spacing } from '../../theme'
import { PriorityBadge } from '../complaint'
import { Skeleton } from '../feedback'
import { LocationMap } from '../map/LocationMap'
import { Banner, Button, Card, Icon, Input, Pill, Text } from '../ui'

const MAX_DESCRIPTION = 1000 // shared/constants.json limits.description_max_chars

// ---- Step 1: category -------------------------------------------------------------------------

export function CategoryStep() {
  const { t } = useI18n()
  const { draft, update } = useReport()
  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.categoryTitle')} body={t('report.categoryBody')} />
      <View style={styles.categoryGrid}>
        {ISSUE_TYPES.map((issue) => {
          const selected = draft.issueType === issue.type
          return (
            <Pressable key={issue.type} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={t(`cat.${issue.type}`)}
              onPress={() => update({ issueType: issue.type, analysis: null, duplicateAcknowledged: false })}
              style={({ pressed }) => [styles.categoryCard, selected && styles.categorySelected, pressed && { opacity: 0.9 }]}>
              <View style={[styles.categoryIcon, selected && { backgroundColor: colors.primary }]}>
                <Icon name={issue.icon} size={28} color={selected ? '#FFFFFF' : colors.primary} />
              </View>
              <Text variant="h3" style={{ textAlign: 'center' }}>{t(`cat.${issue.type}`)}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ---- Step 2: photo ----------------------------------------------------------------------------

export function PhotoStep() {
  const { t } = useI18n()
  const { draft, update } = useReport()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Camera only: the backend wants a photo taken on the spot (docs/API.md §5.6). Right after the shot we
  // read the GPS fix so the server can check accuracy; it also pre-fills the location step.
  const shoot = async () => {
    setError(null)
    setBusy(true)
    try {
      const photo = await takePhoto()
      if (!photo) return
      let fix: Awaited<ReturnType<typeof getCurrentFix>> | null = null
      try {
        fix = await getCurrentFix()
      } catch {
        // The location step explains and lets the citizen place the pin manually.
      }
      update({
        photo: { ...photo, accuracyM: fix?.accuracyM ?? null },
        analysis: null,
        duplicateAcknowledged: false,
        ...(fix && !draft.location ? { location: { lat: fix.lat, lng: fix.lng, address: fix.address ?? '' } } : {}),
      })
    } catch (e) {
      if (e instanceof PhotoError) {
        setError(e.reason === 'permission' ? t('report.permissionCamera')
          : e.reason === 'size' ? t('report.photoTooBig', { mb: PHOTO_MAX_MB }) : t('report.photoType'))
      } else setError(t('common.errorBody'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.photoTitle')} body={t('report.photoBody')} />
      {draft.photo ? (
        <View style={{ gap: spacing.md }}>
          <View>
            <Image source={{ uri: draft.photo.uri }} style={styles.preview} accessibilityLabel={t('detail.photo')} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('report.removePhoto')} onPress={() => update({ photo: null, analysis: null })} style={styles.removeBadge}>
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <Button label={t('report.retake')} icon="camera-retake-outline" variant="secondary" onPress={shoot} loading={busy} />
        </View>
      ) : (
        <View style={styles.dropzone}>
          <View style={styles.dropIcon}><Icon name="camera-plus-outline" size={32} color={colors.primary} /></View>
          <Button label={t('report.camera')} icon="camera-outline" onPress={shoot} loading={busy} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
      {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}
    </View>
  )
}

// ---- Step 3: location -------------------------------------------------------------------------

export function LocationStep() {
  const { t } = useI18n()
  const { draft, update } = useReport()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)
  const location = draft.location

  const locate = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const fix = await getCurrentFix()
      update({ location: { lat: fix.lat, lng: fix.lng, address: fix.address ?? '' }, analysis: null, duplicateAcknowledged: false })
    } catch (e) {
      setMessage(t(e instanceof LocationError && e.reason === 'denied' ? 'report.locationDenied' : 'report.locationFailed'))
    } finally {
      setBusy(false)
    }
  }, [t, update])

  // Ask for the GPS fix once when the step first opens with no location yet.
  useEffect(() => {
    if (!location && !started.current) {
      started.current = true
      void locate()
    }
  }, [location, locate])

  const onPick = useCallback(async (lat: number, lng: number) => {
    update({ location: { lat, lng, address: '' }, analysis: null, duplicateAcknowledged: false })
    const address = await reverseAddress(lat, lng)
    if (address) update({ location: { lat, lng, address } })
  }, [update])

  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.locationTitle')} body={t('report.locationBody')} />
      <LocationMap pin={location ? { lat: location.lat, lng: location.lng } : null} editable height={280} onPick={onPick} />
      <Button label={busy ? t('report.locating') : t('report.useMyLocation')} icon="crosshairs-gps" variant="secondary" onPress={locate} loading={busy} />
      {message && !location ? <Banner tone="warning" icon="map-marker-alert-outline"><Text variant="small" color={colors.warning}>{message}</Text></Banner> : null}
      {location ? (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.row}>
            <Icon name="map-marker" color={colors.primary} size={20} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color={colors.textMuted}>{t('report.coordinates')}</Text>
              <Text variant="small" style={{ fontWeight: '600' }}>{formatCoords(location.lat, location.lng)}</Text>
            </View>
          </View>
          <Input label={t('report.addressLabel')} value={location.address} placeholder={t('report.addressPlaceholder')} maxLength={255}
            onChangeText={(address) => update({ location: { ...location, address } })} />
        </Card>
      ) : null}
    </View>
  )
}

// ---- Step 4: description ----------------------------------------------------------------------

export function DetailsStep() {
  const { t } = useI18n()
  const { draft, update } = useReport()
  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.descTitle')} />
      <Input label={`${t('report.descTitle')} (${t('common.optional')})`} value={draft.description} multiline maxLength={MAX_DESCRIPTION}
        placeholder={t('report.descPlaceholder')} onChangeText={(description) => update({ description, analysis: null })}
        hint={`${draft.description.length}/${MAX_DESCRIPTION}`} />
    </View>
  )
}

// ---- Step 5: AI analysis + duplicates ---------------------------------------------------------

type AnalysisState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done' }

export function analysisKey(d: { photo: { uri: string } | null; location: { lat: number; lng: number } | null; description: string }) {
  return `${d.photo?.uri}|${d.location?.lat.toFixed(5)},${d.location?.lng.toFixed(5)}|${d.description.trim()}`
}

export function AnalysisStep() {
  const { t, language } = useI18n()
  const router = useRouter()
  const { draft, update } = useReport()
  const key = analysisKey(draft)
  const cached = draft.analysis?.key === key ? draft.analysis.result : null
  const [state, setState] = useState<AnalysisState>(cached ? { status: 'done' } : { status: 'loading' })

  const run = useCallback(async () => {
    if (!draft.photo || !draft.location) return
    setState({ status: 'loading' })
    try {
      const result = await complaintsApi.analyze({
        photo: draft.photo, lat: draft.location.lat, lng: draft.location.lng,
        description: draft.description.trim() || undefined,
      })
      const chosen = ISSUE_TYPES.find((i) => i.type === draft.issueType)?.category
      const sameGroup = !chosen || chosen === result.suggested_category || chosen === 'road_damage' && result.suggested_category === 'pothole'
      update({ analysis: { result, key }, useAiCategory: sameGroup || draft.issueType === 'other' })
      setState({ status: 'done' })
    } catch (e) {
      setState({ status: 'error', message: errorMessage(e, t) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!cached) void run()
  }, [cached, run])

  if (state.status === 'loading') return <AnalysisSkeleton />
  if (state.status === 'error' || !cached) {
    return (
      <View style={{ gap: spacing.lg }}>
        <StepTitle title={t('report.aiTitle')} />
        <Banner tone="warning" icon="robot-confused-outline">
          <Text variant="small" color={colors.warning}>{t('report.analysisFailed')}</Text>
          {state.status === 'error' ? <Text variant="caption" color={colors.warning}>{state.message}</Text> : null}
        </Banner>
        <Button label={t('common.retry')} variant="secondary" onPress={run} />
        <Button label={t('report.skipAi')} variant="ghost" onPress={() => update({ skippedKey: key })} />
      </View>
    )
  }

  const result: AnalyzeResult = cached
  const duplicates = result.nearby_duplicates
  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.aiTitle')} />
      <AiResultCard result={result} />
      {result.active_announcement ? (
        <Banner tone="info" icon="bullhorn-outline">
          <Text variant="small" color={colors.primaryDark} style={{ fontWeight: '700' }}>{t('report.announcementTitle')}: {localized(result.active_announcement.title, language)}</Text>
          <Text variant="small" color={colors.primaryDark}>{localized(result.active_announcement.message, language)}</Text>
        </Banner>
      ) : null}
      {result.photo_check && !result.photo_check.live ? (
        <Banner tone="warning" icon="camera-off-outline">
          <Text variant="small" color={colors.warning} style={{ fontWeight: '700' }}>{t('report.notLiveTitle')}</Text>
          {result.photo_check.problems.map((problem) => { const text = typeof problem === 'string' ? problem : problem.message; return <Text key={text} variant="small" color={colors.warning}>• {text}</Text> })}
          <Button label={t('report.retake')} variant="secondary" style={{ minHeight: 40, marginTop: spacing.sm, alignSelf: 'flex-start' }} onPress={() => update({ step: 'photo' })} />
        </Banner>
      ) : null}
      {!result.is_civic_issue ? <Banner tone="warning" icon="image-search-outline"><Text variant="small" color={colors.warning}>{t('report.aiNotCivic')}</Text></Banner> : null}
      <CategoryChoice result={result} />

      {duplicates.length ? (
        <Card style={styles.duplicate}>
          <View style={styles.row}>
            <Icon name="content-copy" size={20} color={colors.warning} />
            <Text variant="h3" color={colors.warning}>{t('report.dupTitle')}</Text>
          </View>
          <Text variant="small" color={colors.textMuted}>{t('report.dupBody')}</Text>
          <Text variant="small" style={{ fontWeight: '600' }}>{t('report.dupCount', { n: duplicates.length })}</Text>
          {duplicates.map((dup) => (
            <View key={dup.id} style={styles.dupRow}>
              <Icon name={CATEGORY_ICONS[dup.category]} size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="small" style={{ fontWeight: '600' }}>{dup.code}</Text>
                <Text variant="caption" color={colors.textMuted}>{t(categoryKey(dup.category))} · {t('report.dupDistance', { m: Math.round(dup.distance_m) })}</Text>
              </View>
              <Pill label={t(`status.${dup.status}`)} tone="neutral" />
            </View>
          ))}
          <View style={{ gap: spacing.sm }}>
            <Button label={t('report.dupView')} variant="secondary" onPress={() => router.push({ pathname: '/complaint/[id]', params: { id: String(duplicates[0].id) } })} />
            <Button label={t('report.dupContinue')} variant={draft.duplicateAcknowledged ? 'primary' : 'ghost'} icon={draft.duplicateAcknowledged ? 'check' : undefined}
              onPress={() => update({ duplicateAcknowledged: true })} />
          </View>
        </Card>
      ) : null}
    </View>
  )
}

/** Shows the real response fields only: whatever the backend did not send is not shown. */
export function AiResultCard({ result }: { result: AnalyzeResult }) {
  const { t } = useI18n()
  const rows: [string, React.ReactNode][] = [
    [t('report.aiDetected'), <Text key="d" variant="h3">{t(categoryKey(result.suggested_category))}</Text>],
    [t('report.aiConfidence'), <Text key="c" variant="h3">{Math.round(result.confidence * 100)}%</Text>],
    [t('report.aiPriority'), <PriorityBadge key="p" level={result.priority_level} />],
    [t('report.aiDepartment'), <Text key="dep" variant="h3">{t(`dept.${result.department}`)}</Text>],
  ]
  return (
    <Card style={styles.aiCard}>
      <View style={styles.row}>
        <View style={styles.aiBadge}><Icon name="robot-outline" size={16} color={colors.accent} /></View>
        <Text variant="h3" color={colors.accent}>{t('report.aiTitle')}</Text>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.aiRow}>
          <Text variant="small" color={colors.textMuted}>{label}</Text>
          {value}
        </View>
      ))}
      {result.summary ? <Text variant="small" color={colors.text}>{result.summary}</Text> : null}
    </Card>
  )
}

function CategoryChoice({ result }: { result: AnalyzeResult }) {
  const { t } = useI18n()
  const { draft, update } = useReport()
  const chosen = ISSUE_TYPES.find((i) => i.type === draft.issueType)?.category
  if (!chosen || chosen === result.suggested_category) return null
  const options = [
    { value: true, label: t(categoryKey(result.suggested_category)), hint: t('report.aiTitle') },
    { value: false, label: t(categoryKey(chosen)), hint: t('report.yourChoice') },
  ]
  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((option) => {
        const selected = draft.useAiCategory === option.value
        return (
          <Pressable key={String(option.value)} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => update({ useAiCategory: option.value })}
            style={[styles.choice, selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
            <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? colors.primary : colors.textFaint} />
            <View style={{ flex: 1 }}>
              <Text variant="h3">{option.label}</Text>
              <Text variant="caption" color={colors.textMuted}>{option.hint}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function AnalysisSkeleton() {
  const { t } = useI18n()
  return (
    <View style={{ gap: spacing.lg }} accessibilityLiveRegion="polite">
      <View style={[styles.row, { justifyContent: 'center', paddingVertical: spacing.lg }]}>
        <Icon name="robot-outline" size={22} color={colors.accent} />
        <Text variant="h3" color={colors.accent}>{t('report.analyzing')}</Text>
      </View>
      <Card style={{ gap: spacing.lg }}>
        <Skeleton width="40%" height={16} />
        <Skeleton height={20} /><Skeleton height={20} /><Skeleton width="70%" height={20} />
      </Card>
    </View>
  )
}

// ---- Step 6: review ---------------------------------------------------------------------------

export function ReviewStep() {
  const { t } = useI18n()
  const { draft, chosenCategory } = useReport()
  const analysis = draft.analysis?.result
  const category = chosenCategory(ISSUE_TYPES.find((i) => i.type === draft.issueType)?.category)
  const rows: [string, string][] = [
    [t('detail.category'), category ? t(categoryKey(category)) : analysis ? t(categoryKey(analysis.suggested_category)) : t('cat.other')],
    [t('detail.location'), draft.location ? draft.location.address || formatCoords(draft.location.lat, draft.location.lng) : '—'],
    [t('detail.description'), draft.description.trim() || t('report.noDescription')],
  ]
  return (
    <View style={{ gap: spacing.lg }}>
      <StepTitle title={t('report.reviewTitle')} />
      {draft.photo ? <Image source={{ uri: draft.photo.uri }} style={styles.preview} accessibilityLabel={t('detail.photo')} /> : null}
      <Card style={{ gap: spacing.lg }}>
        {rows.map(([label, value]) => (
          <View key={label} style={{ gap: 2 }}>
            <Text variant="caption" color={colors.textMuted}>{label}</Text>
            <Text style={{ fontWeight: '500' }}>{value}</Text>
          </View>
        ))}
        {analysis ? (
          <View style={styles.reviewAi}>
            <View style={styles.row}>
              <Icon name="robot-outline" size={16} color={colors.accent} />
              <Text variant="small" color={colors.accent} style={{ fontWeight: '700' }}>{t('report.aiTitle')}</Text>
              <Text variant="small" color={colors.textMuted}>· {Math.round(analysis.confidence * 100)}%</Text>
            </View>
            <View style={styles.row}>
              <Text variant="small" color={colors.textMuted}>{t('detail.priority')}</Text>
              <Pill label={t(priorityKey(analysis.priority_level))} tone={PRIORITY_TONE[analysis.priority_level]} />
            </View>
          </View>
        ) : null}
      </Card>
    </View>
  )
}

function StepTitle({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="h2" accessibilityRole="header">{title}</Text>
      {body ? <Text variant="small" color={colors.textMuted}>{body}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  categoryCard: { flexGrow: 1, flexBasis: '44%', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  categorySelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  categoryIcon: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dropzone: { alignItems: 'center', gap: spacing.xl, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  dropIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.border },
  removeBadge: { position: 'absolute', top: spacing.md, right: spacing.md, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,42,74,0.75)', alignItems: 'center', justifyContent: 'center' },
  aiCard: { backgroundColor: colors.accentLight, borderColor: '#DDD6FE', gap: spacing.md },
  aiBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  aiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  duplicate: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', gap: spacing.md },
  dupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  reviewAi: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentLight },
})
