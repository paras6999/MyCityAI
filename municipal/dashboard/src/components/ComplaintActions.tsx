import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle, BellRing, Camera, LoaderCircle, Play, UserPlus, XCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import {
  addComment,
  escalateComplaint,
  listOfficers,
  remindDepartment,
  updateComplaint,
  uploadProof,
} from '../api/complaints'
import type { Complaint, ComplaintUpdate, Role, Status } from '../api/types'
import { STATUS_TRANSITIONS } from '../lib/constants'
import { currentPosition } from '../lib/geolocation'
import { useToast } from './toast/toastContext'

const STOPPED: Status[] = ['resolved', 'closed', 'rejected', 'merged']
// The escalation level each role works at; they may push a complaint one step above it.
const ROLE_LEVEL: Partial<Record<Role, number>> = { officer: 0, ward_rep: 1 }

/**
 * Actions on one complaint. Officers / mayor (`canEdit`) change it; ward reps comment,
 * escalate and remind; officers and ward reps can escalate one level up (API.md §6.6).
 */
export function ComplaintActions({
  complaint,
  canEdit,
  role,
}: {
  complaint: Complaint
  canEdit: boolean
  role?: Role
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [assignee, setAssignee] = useState<string>(String(complaint.assigned_to?.id ?? ''))
  const [rejecting, setRejecting] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = STATUS_TRANSITIONS[complaint.status] ?? []
  const canAssign = canEdit && ['new', 'assigned', 'reopened'].includes(complaint.status)
  const isOpen = !STOPPED.includes(complaint.status)
  const myLevel = role ? ROLE_LEVEL[role] : undefined
  const canEscalate =
    isOpen && myLevel !== undefined && complaint.escalation_level <= myLevel && complaint.escalation_level < 2
  const canRemind = isOpen && (role === 'ward_rep' || role === 'mayor' || role === 'admin')

  const officers = useQuery({
    queryKey: ['officers', complaint.department],
    queryFn: () => listOfficers(complaint.department),
    enabled: canAssign,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['complaint', complaint.id] })
    queryClient.invalidateQueries({ queryKey: ['timeline', complaint.id] })
    queryClient.invalidateQueries({ queryKey: ['complaints'] })
  }

  function onError(err: unknown) {
    if (err instanceof ApiError && err.code === 'PHOTO_NOT_LIVE' && Array.isArray(err.details)) {
      const reasons = (err.details as { message: string }[]).map((d) => d.message).join(' · ')
      setError(`${t('actions.proofNotLive')} ${reasons}`)
      return
    }
    setError(err instanceof ApiError ? err.message : t('actions.failed'))
  }

  const update = useMutation({
    mutationFn: (body: ComplaintUpdate) => updateComplaint(complaint.id, body),
    onSuccess: () => {
      setError(null)
      setRejecting(false)
      refresh()
    },
    onError,
  })

  const comment = useMutation({
    mutationFn: (note: string) => addComment(complaint.id, note),
    onSuccess: refresh,
    onError,
  })

  const escalate = useMutation({
    mutationFn: (reason: string) => escalateComplaint(complaint.id, reason),
    onSuccess: () => {
      setError(null)
      setEscalating(false)
      toast.show({ title: t('escalation.done'), body: complaint.code })
      refresh()
    },
    onError,
  })

  const remind = useMutation({
    mutationFn: () => remindDepartment(complaint.id, ''),
    onSuccess: () => {
      setError(null)
      toast.show({
        title: t('escalation.reminded'),
        body: t(`departments.${complaint.department}`),
      })
      refresh()
    },
    onError,
  })

  const [locating, setLocating] = useState(false)

  const proof = useMutation({
    mutationFn: async ({ photo, note }: { photo: File; note: string }) => {
      // Live photo rule (API.md §5.6): send where the officer is and when the photo was taken.
      setLocating(true)
      const position = await currentPosition()
      setLocating(false)
      if (!position) toast.show({ title: t('actions.uploadProof'), body: t('actions.proofNoLocation') })
      return uploadProof(complaint.id, photo, note, {
        lat: position?.lat,
        lng: position?.lng,
        accuracyM: position?.accuracyM,
        // A photo just taken with the camera has lastModified = the moment of capture.
        capturedAt: new Date(photo.lastModified).toISOString(),
      })
    },
    onSuccess: ({ verification }) => {
      setError(null)
      // The panel re-mounts after the update, so the verdict is shown as a toast.
      if (verification.ai_verified === false) {
        toast.show({
          title: t('actions.uploadProof'),
          body: t('actions.proofRejected', { reason: verification.reason }),
        })
      } else {
        toast.show({
          title: t('actions.uploadProof'),
          body: t(verification.ai_verified ? 'actions.proofVerified' : 'actions.proofNotChecked'),
        })
      }
      refresh()
    },
    onError,
  })

  function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const photo = form.get('after_photo')
    if (photo instanceof File && photo.size > 0) {
      proof.mutate({ photo, note: String(form.get('proof_note') ?? '').trim() })
    }
  }

  function submitReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get('note')).trim()
    if (note) update.mutate({ status: 'rejected', note })
  }

  function submitEscalate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason')).trim()
    if (reason) escalate.mutate(reason)
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const note = String(new FormData(form).get('comment')).trim()
    if (note) comment.mutate(note, { onSuccess: () => form.reset() })
  }

  const busy =
    update.isPending || comment.isPending || proof.isPending || escalate.isPending || remind.isPending
  const button =
    'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canAssign && (
        <div>
          <label htmlFor="assignee" className="text-xs font-medium uppercase tracking-wide text-muted">
            {t('actions.assignTo')}
          </label>
          <div className="mt-1 flex gap-2">
            <select
              id="assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
            >
              <option value="">{t('actions.chooseOfficer')}</option>
              {officers.data?.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!assignee || busy || Number(assignee) === complaint.assigned_to?.id}
              onClick={() => update.mutate({ assigned_to_id: Number(assignee) })}
              className={`${button} bg-primary text-white hover:bg-primary-dark`}
            >
              <UserPlus size={15} aria-hidden />
              {t('actions.assign')}
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {next.includes('in_progress') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => update.mutate({ status: 'in_progress' })}
              className={`${button} bg-info-bg text-info hover:bg-primary-light`}
            >
              <Play size={15} aria-hidden />
              {t('actions.startWork')}
            </button>
          )}
          {next.includes('rejected') && !rejecting && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className={`${button} border border-danger/30 text-danger hover:bg-danger-bg`}
            >
              <XCircle size={15} aria-hidden />
              {t('actions.reject')}
            </button>
          )}
        </div>
      )}

      {canEdit && next.includes('resolved') && (
        <form onSubmit={submitProof} className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            {t('actions.proofTitle')}
          </div>
          <label className="block text-xs text-muted">
            {t('actions.proofPhoto')}
            <input
              name="after_photo"
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              required
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary"
            />
          </label>
          <label className="block text-xs text-muted">
            {t('actions.proofNote')}
            <input
              name="proof_note"
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={`${button} w-full bg-success text-white hover:opacity-90`}
          >
            {proof.isPending ? (
              <LoaderCircle size={15} className="animate-spin" aria-hidden />
            ) : (
              <Camera size={15} aria-hidden />
            )}
            {locating
              ? t('actions.proofLocating')
              : proof.isPending
                ? t('actions.proofChecking')
                : t('actions.proofSubmit')}
          </button>
        </form>
      )}

      {rejecting && (
        <form onSubmit={submitReject} className="space-y-2 rounded-lg bg-danger-bg/50 p-3">
          <label htmlFor="reject-note" className="text-xs font-medium text-danger">
            {t('actions.rejectReason')}
          </label>
          <textarea
            id="reject-note"
            name="note"
            required
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`${button} bg-danger text-white`}>
              {t('actions.confirmReject')}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className={`${button} bg-surface text-text`}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {(canEscalate || canRemind) && !escalating && (
        <div className="flex flex-wrap gap-2">
          {canEscalate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEscalating(true)}
              className={`${button} border border-accent-border text-accent hover:bg-accent-light`}
            >
              <ArrowUpCircle size={15} aria-hidden />
              {t(complaint.escalation_level === 0 ? 'escalation.toWardRep' : 'escalation.toMayor')}
            </button>
          )}
          {canRemind && (
            <button
              type="button"
              disabled={busy}
              onClick={() => remind.mutate()}
              className={`${button} bg-warning-bg text-warning hover:opacity-90`}
            >
              <BellRing size={15} aria-hidden />
              {t('escalation.remind')}
            </button>
          )}
        </div>
      )}

      {escalating && (
        <form onSubmit={submitEscalate} className="space-y-2 rounded-lg bg-accent-light/60 p-3">
          <label htmlFor="escalate-reason" className="text-xs font-medium text-accent">
            {t('escalation.reason')}
          </label>
          <textarea
            id="escalate-reason"
            name="reason"
            required
            maxLength={500}
            rows={2}
            placeholder={t('escalation.reasonPlaceholder')}
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`${button} bg-accent text-white`}>
              {t('escalation.confirm')}
            </button>
            <button
              type="button"
              onClick={() => setEscalating(false)}
              className={`${button} bg-surface text-text`}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={submitComment} className="space-y-2">
        <label htmlFor="comment" className="text-xs font-medium uppercase tracking-wide text-muted">
          {t('actions.comment')}
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={2}
          placeholder={t('actions.commentPlaceholder')}
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className={`${button} bg-neutral-bg text-text hover:bg-border`}
        >
          {t('actions.addComment')}
        </button>
      </form>
    </div>
  )
}
