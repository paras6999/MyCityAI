import { CheckCircle2, HelpCircle, Star, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { mediaUrl } from '../api/complaints'
import type { Complaint } from '../api/types'
import { formatDateTime } from '../lib/format'

/** Before/after photos with the AI verdict, plus the citizen's feedback when given. */
export function BeforeAfterCard({ complaint }: { complaint: Complaint }) {
  const { t } = useTranslation()
  const proof = complaint.proof
  const feedback = complaint.feedback
  if (!proof) return null

  const before = mediaUrl(complaint.photo_url)
  const after = mediaUrl(proof.after_photo_url)
  const verdict =
    proof.ai_verified === true
      ? { icon: CheckCircle2, text: t('proof.verified'), tone: 'bg-success-bg text-success' }
      : proof.ai_verified === false
        ? { icon: XCircle, text: t('proof.notFixed'), tone: 'bg-danger-bg text-danger' }
        : { icon: HelpCircle, text: t('proof.notChecked'), tone: 'bg-neutral-bg text-neutral' }
  const VerdictIcon = verdict.icon

  return (
    <section className="rounded-xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('proof.title')}</h2>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdict.tone}`}>
          <VerdictIcon size={13} aria-hidden />
          {verdict.text}
          {proof.ai_confidence !== null && ` · ${Math.round(proof.ai_confidence * 100)}%`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t('proof.before'), src: before },
          { label: t('proof.after'), src: after },
        ].map(({ label, src }) => (
          <figure key={label}>
            {src ? (
              <img src={src} alt={label} className="aspect-[4/3] w-full rounded-lg bg-neutral-bg object-cover" />
            ) : (
              <div className="aspect-[4/3] w-full rounded-lg bg-neutral-bg" />
            )}
            <figcaption className="mt-1 text-xs text-muted">{label}</figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-3 text-sm">
        {proof.reason}{' '}
        <span className="text-xs text-muted">
          ({t(`proof.method.${proof.method}`)} · {formatDateTime(proof.uploaded_at)})
        </span>
      </p>
      {proof.note && <p className="mt-1 text-sm text-muted">“{proof.note}”</p>}

      <div className="mt-4 border-t border-neutral-bg pt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{t('feedback.title')}</h3>
        {feedback ? (
          <div className="mt-1 text-sm">
            <span className={feedback.action === 'reopen' ? 'font-semibold text-danger' : 'font-semibold'}>
              {t(`feedback.${feedback.action}`)}
            </span>
            {feedback.rating !== null && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-warning" title={t('feedback.rating', { rating: feedback.rating })}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={13} fill={i < (feedback.rating ?? 0) ? 'currentColor' : 'none'} aria-hidden />
                ))}
              </span>
            )}
            {feedback.comment && <p className="mt-1 text-muted">“{feedback.comment}”</p>}
          </div>
        ) : complaint.status === 'resolved' ? (
          <p className="mt-1 text-sm text-muted">{t('feedback.waiting')}</p>
        ) : null}
      </div>
    </section>
  )
}
