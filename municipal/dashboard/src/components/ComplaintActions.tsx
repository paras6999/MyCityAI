import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, LoaderCircle, Play, UserPlus, XCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '../api/client'
import { addComment, listOfficers, updateComplaint, uploadProof } from '../api/complaints'
import type { Complaint, ComplaintUpdate } from '../api/types'
import { STATUS_TRANSITIONS } from '../lib/constants'
import { useToast } from './toast/toastContext'

/** Officer actions on one complaint. Ward reps (`canEdit=false`) can only comment. */
export function ComplaintActions({ complaint, canEdit }: { complaint: Complaint; canEdit: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [assignee, setAssignee] = useState<string>(String(complaint.assigned_to?.id ?? ''))
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = STATUS_TRANSITIONS[complaint.status] ?? []
  const canAssign = canEdit && ['new', 'assigned', 'reopened'].includes(complaint.status)

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

  const proof = useMutation({
    mutationFn: ({ photo, note }: { photo: File; note: string }) =>
      uploadProof(complaint.id, photo, note),
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

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const note = String(new FormData(form).get('comment')).trim()
    if (note) comment.mutate(note, { onSuccess: () => form.reset() })
  }

  const busy = update.isPending || comment.isPending || proof.isPending
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
            {proof.isPending ? t('actions.proofChecking') : t('actions.proofSubmit')}
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
