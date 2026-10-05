import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { ApiError, mediaUrl } from '../api/client'
import { complaintsApi } from '../api/complaints'
import type { Complaint } from '../api/types'
import { useI18n } from '../i18n'
import { errorMessage } from '../lib/domain'
import { formatDateTime } from '../lib/format'
import { colors, radius, spacing } from '../theme'
import { useToast } from './feedback'
import { Banner, Button, Card, Icon, Input, Pill, SectionHeader, Text } from './ui'

/** Repair proof uploaded by the municipality (docs/API.md §3.7) with the AI's before/after verdict. */
export function ProofCard({ complaint }: { complaint: Complaint }) {
  const { t, language } = useI18n()
  const proof = complaint.proof
  if (!proof) return null
  const photo = mediaUrl(proof.after_photo_url)
  const before = mediaUrl(complaint.photo_url)
  const verdict =
    proof.ai_verified === true ? { label: t('proof.verified'), tone: 'success' as const }
    : proof.ai_verified === false ? { label: t('proof.notVerified'), tone: 'warning' as const }
    : { label: t('proof.unchecked'), tone: 'neutral' as const }
  return (
    <View>
      <SectionHeader title={t('proof.title')} />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {before ? <View style={{ flex: 1, gap: 4 }}><Image source={{ uri: before }} style={styles.thumb} accessibilityLabel={t('proof.before')} /><Text variant="caption" color={colors.textMuted}>{t('proof.before')}</Text></View> : null}
          {photo ? <View style={{ flex: 1, gap: 4 }}><Image source={{ uri: photo }} style={styles.thumb} accessibilityLabel={t('proof.after')} /><Text variant="caption" color={colors.textMuted}>{t('proof.after')}</Text></View> : null}
        </View>
        <Pill label={verdict.label} tone={verdict.tone} icon={proof.ai_verified === true ? 'check-decagram-outline' : undefined} />
        {proof.note ? <Text variant="small">{proof.note}</Text> : null}
        {proof.reason ? <Text variant="caption" color={colors.textMuted}>{proof.reason}</Text> : null}
        <Text variant="caption" color={colors.textFaint}>{formatDateTime(proof.uploaded_at, language)}</Text>
      </Card>
    </View>
  )
}

/** Confirm the fix or reopen the complaint. Only the original reporter can answer (docs/API.md §5.4). */
export function FeedbackCard({ complaint, onUpdated }: { complaint: Complaint; onUpdated: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [reopening, setReopening] = useState(false)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'confirm' | 'reopen' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (complaint.feedback?.action === 'auto_closed') {
    return <Banner tone="neutral" icon="clock-check-outline"><Text variant="small">{t('feedback.autoClosed')}</Text></Banner>
  }
  if (complaint.feedback) {
    const fb = complaint.feedback
    return (
      <View>
        <SectionHeader title={t('feedback.yours')} />
        <Card style={{ gap: spacing.sm }}>
          {fb.rating ? <Stars value={fb.rating} /> : null}
          {fb.comment ? <Text variant="small">{fb.comment}</Text> : null}
        </Card>
      </View>
    )
  }
  if (complaint.status !== 'resolved' || complaint.merged_into_id) return null

  const send = async (action: 'confirm' | 'reopen') => {
    if (action === 'reopen' && !comment.trim()) return setCommentError(t('feedback.commentRequired'))
    setBusy(action)
    setError(null)
    try {
      await complaintsApi.feedback(complaint.id, {
        action,
        ...(rating ? { rating } : {}),
        ...(action === 'reopen' ? { comment: comment.trim() } : {}),
      })
      toast.show(t('feedback.sent'), 'success')
      onUpdated()
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'INVALID_STATUS_TRANSITION' ? t('feedback.alreadyAnswered') : errorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View>
      <SectionHeader title={t('feedback.title')} />
      <Card style={{ gap: spacing.lg, borderColor: colors.accent }}>
        <Text variant="small" color={colors.textMuted}>{t('feedback.body')}</Text>
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color={colors.textMuted}>{t('feedback.rating')}</Text>
          <Stars value={rating} onChange={setRating} />
        </View>
        {reopening ? (
          <Input label={t('feedback.comment')} value={comment} multiline maxLength={1000} error={commentError}
            onChangeText={(v) => { setComment(v); setCommentError(null) }} />
        ) : null}
        {error ? <Banner tone="danger" icon="alert-circle-outline"><Text variant="small" color={colors.danger}>{error}</Text></Banner> : null}
        {reopening ? (
          <View style={{ gap: spacing.sm }}>
            <Button label={t('feedback.sendReopen')} variant="danger" onPress={() => send('reopen')} loading={busy === 'reopen'} />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => { setReopening(false); setCommentError(null) }} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Button label={t('feedback.confirm')} icon="check" onPress={() => send('confirm')} loading={busy === 'confirm'} />
            <Button label={t('feedback.reopen')} variant="secondary" onPress={() => setReopening(true)} />
          </View>
        )}
        <Text variant="caption" color={colors.textFaint}>{t('feedback.autoClose')}</Text>
      </Card>
    </View>
  )
}

function Stars({ value, onChange }: { value: number; onChange?: (rating: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }} accessibilityRole={onChange ? 'radiogroup' : 'text'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} hitSlop={4} accessibilityRole="radio" accessibilityLabel={`${n}/5`} accessibilityState={{ selected: n === value }}
          onPress={() => onChange?.(n === value ? 0 : n)}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={30} color={n <= value ? '#F59E0B' : colors.textFaint} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  thumb: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.border },
})
