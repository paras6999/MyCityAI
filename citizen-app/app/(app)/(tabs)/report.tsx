import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ApiError } from '../../../src/api/client'
import { complaintsApi } from '../../../src/api/complaints'
import { ConfirmDialog } from '../../../src/components/Dialog'
import { Screen } from '../../../src/components/Screen'
import { AnalysisStep, CategoryStep, DetailsStep, LocationStep, PhotoStep, ReviewStep, analysisKey } from '../../../src/components/report/steps'
import { Banner, Button, IconButton, Text } from '../../../src/components/ui'
import { useI18n } from '../../../src/i18n'
import { ISSUE_TYPES, errorMessage, type IssueType } from '../../../src/lib/domain'
import { REPORT_STEPS, useReport } from '../../../src/store/report'
import { colors, radius, spacing } from '../../../src/theme'

export default function ReportScreen() {
  const { t, language } = useI18n()
  const router = useRouter()
  const { type } = useLocalSearchParams<{ type?: string }>()
  const { draft, update, reset, isDirty, chosenCategory } = useReport()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quick actions on Home open the flow with the category already chosen.
  useEffect(() => {
    const issue = ISSUE_TYPES.find((i) => i.type === type)
    if (issue) update({ issueType: issue.type as IssueType, step: draft.photo ? draft.step : 'photo' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const index = REPORT_STEPS.indexOf(draft.step)
  const go = (offset: number) => {
    setError(null)
    update({ step: REPORT_STEPS[Math.min(Math.max(index + offset, 0), REPORT_STEPS.length - 1)] })
  }

  const analysis = draft.analysis?.key === analysisKey(draft) ? draft.analysis.result : null
  const hasDuplicates = (analysis?.nearby_duplicates.length ?? 0) > 0
  const canContinue =
    draft.step === 'category' ? !!draft.issueType
    : draft.step === 'photo' ? !!draft.photo
    : draft.step === 'location' ? !!draft.location
    : draft.step === 'analysis' ? draft.skippedKey === analysisKey(draft) || (!!analysis && (!hasDuplicates || draft.duplicateAcknowledged))
    : true

  const submit = async () => {
    if (!draft.photo || !draft.location) return
    setSubmitting(true)
    setError(null)
    try {
      const complaint = await complaintsApi.submit({
        photo: draft.photo,
        lat: draft.location.lat,
        lng: draft.location.lng,
        description: draft.description.trim() || undefined,
        address: draft.location.address.trim() || undefined,
        category: chosenCategory(ISSUE_TYPES.find((i) => i.type === draft.issueType)?.category),
        language,
      })
      reset()
      router.replace({ pathname: '/submitted/[id]', params: { id: String(complaint.id) } })
    } catch (e) {
      // PHOTO_NOT_LIVE (production): the backend lists what is wrong with the photo in `details`.
      if (e instanceof ApiError && e.code === 'PHOTO_NOT_LIVE') {
        const problems = Array.isArray(e.details) ? e.details.map((d: { message?: string }) => d?.message ?? '').join(' ') : ''
        setError(`${t('report.notLiveTitle')} ${problems}`.trim())
        update({ step: 'photo', photo: null, analysis: null })
      } else {
        setError(errorMessage(e, t))
      }
      setSubmitting(false)
    }
  }

  const header = (
    <View style={styles.header}>
      {index > 0 ? <IconButton icon="arrow-left" label={t('common.back')} onPress={() => go(-1)} /> : <View style={{ width: 44 }} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h3">{t('report.title')}</Text>
        <Text variant="caption" color={colors.textMuted}>{t('report.step', { n: index + 1, total: REPORT_STEPS.length })}</Text>
      </View>
      {isDirty ? <IconButton icon="close" label={t('report.discard')} onPress={() => setConfirmDiscard(true)} /> : <View style={{ width: 44 }} />}
    </View>
  )

  const footer = (
    <>
      {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}
      {draft.step === 'review' ? (
        <Button label={t('report.submit')} icon="send-outline" onPress={submit} loading={submitting} />
      ) : (
        <Button label={t('report.next')} onPress={() => go(1)} disabled={!canContinue} />
      )}
    </>
  )

  return (
    <Screen footer={footer} contentStyle={{ gap: spacing.lg }}>
      {header}
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: REPORT_STEPS.length, now: index + 1 }}>
        {REPORT_STEPS.map((step, i) => <View key={step} style={[styles.segment, i <= index && { backgroundColor: colors.primary }]} />)}
      </View>
      {draft.step === 'category' ? <CategoryStep /> : null}
      {draft.step === 'photo' ? <PhotoStep /> : null}
      {draft.step === 'location' ? <LocationStep /> : null}
      {draft.step === 'details' ? <DetailsStep /> : null}
      {draft.step === 'analysis' ? <AnalysisStep /> : null}
      {draft.step === 'review' ? <ReviewStep /> : null}

      <ConfirmDialog
        visible={confirmDiscard} destructive title={t('report.discardTitle')} body={t('report.discardBody')}
        confirmLabel={t('report.discard')} cancelLabel={t('report.keepEditing')}
        onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); reset() }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.sm },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
})
