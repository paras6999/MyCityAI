import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Languages, Megaphone, Send, Sparkles, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createAnnouncement,
  deleteAnnouncement,
  draftAnnouncement,
  listAnnouncements,
  publishAnnouncement,
} from '../api/announcements'
import { ApiError } from '../api/client'
import { CATEGORIES, type Announcement, type AnnouncementPriority, type AnnouncementTarget, type Category } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../components/toast/toastContext'
import { useWards } from '../hooks/useWards'
import { formatDateTime } from '../lib/format'

const PRIORITIES: AnnouncementPriority[] = ['emergency', 'important', 'general']

// Left border colour by priority (docs/Design.md §2.5)
const BORDER: Record<AnnouncementPriority, string> = {
  emergency: 'border-l-danger',
  important: 'border-l-warning',
  general: 'border-l-success',
}

/**
 * Post and manage announcements. Scope follows API.md §7: officer → own department,
 * ward rep → own ward, mayor → any wards or the whole city.
 */
export function AnnouncementsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: wards = [], byId: wardById } = useWards()

  const role = user?.role
  const isWardRep = role === 'ward_rep'
  const canCityWide = role === 'mayor' || role === 'admin'

  const [mode, setMode] = useState<'write' | 'ai'>('write')
  const [priority, setPriority] = useState<AnnouncementPriority>('general')
  const [cityWide, setCityWide] = useState(false)
  const [wardIds, setWardIds] = useState<number[]>([])
  const [linked, setLinked] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState(false)

  const list = useQuery({
    queryKey: ['announcements', showExpired],
    queryFn: () => listAnnouncements(!showExpired),
  })

  function target(form: FormData): AnnouncementTarget {
    const until = String(form.get('valid_until') ?? '')
    return {
      priority,
      department: role === 'officer' ? user?.department : null,
      ward_ids: isWardRep && user?.ward_id ? [user.ward_id] : cityWide ? [] : wardIds,
      city_wide: cityWide,
      valid_until: until ? new Date(until).toISOString() : null,
      linked_categories: linked,
    }
  }

  function done(message: string, form: HTMLFormElement) {
    setError(null)
    form.reset()
    setLinked([])
    queryClient.invalidateQueries({ queryKey: ['announcements'] })
    toast.show({ title: t('ann.title'), body: message })
  }

  function failed(err: unknown) {
    setError(err instanceof ApiError ? err.message : t('actions.failed'))
  }

  const create = useMutation({
    mutationFn: (args: { form: HTMLFormElement }) => {
      const data = new FormData(args.form)
      return createAnnouncement(
        target(data),
        String(data.get('title')).trim(),
        String(data.get('message')).trim(),
        data.get('auto_translate') === 'on',
      )
    },
    onSuccess: (_, { form }) => done(t('ann.posted'), form),
    onError: failed,
  })

  const draft = useMutation({
    mutationFn: (args: { form: HTMLFormElement }) => {
      const data = new FormData(args.form)
      return draftAnnouncement(target(data), String(data.get('note')).trim())
    },
    onSuccess: (_, { form }) => done(t('ann.drafted'), form),
    onError: failed,
  })

  const publish = useMutation({
    mutationFn: publishAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      toast.show({ title: t('ann.title'), body: t('ann.published') })
    },
    onError: failed,
  })

  const remove = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
    onError: failed,
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isWardRep && !cityWide && wardIds.length === 0) {
      setError(t('ann.chooseWard'))
      return
    }
    const form = event.currentTarget
    if (mode === 'write') create.mutate({ form })
    else draft.mutate({ form })
  }

  const busy = create.isPending || draft.isPending
  const input = 'mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm'
  const label = 'block text-xs font-medium uppercase tracking-wide text-muted'

  function wardLabel(id: number): string {
    const ward = wardById.get(id)
    return ward ? `${ward.number} · ${ward.name}` : '?'
  }

  function audience(a: Announcement): string {
    return a.city_wide ? t('ann.cityWide') : a.ward_ids.map(wardLabel).join(', ')
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <section className="h-fit min-w-0 rounded-xl bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Megaphone size={18} aria-hidden />
            {t('ann.new')}
          </h1>
          <div className="flex rounded-lg bg-neutral-bg p-0.5 text-xs font-semibold">
            {(['write', 'ai'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${mode === m ? 'bg-surface shadow-sm' : 'text-muted'}`}
              >
                {m === 'ai' && <Sparkles size={12} aria-hidden />}
                {t(`ann.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'write' ? (
            <>
              <label className={label}>
                {t('ann.titleField')}
                <input name="title" required minLength={3} maxLength={120} className={input} />
              </label>
              <label className={label}>
                {t('ann.messageField')}
                <textarea name="message" required minLength={3} maxLength={1000} rows={3} className={input} />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input name="auto_translate" type="checkbox" defaultChecked />
                <Languages size={14} aria-hidden />
                {t('ann.autoTranslate')}
              </label>
            </>
          ) : (
            <label className={label}>
              {t('ann.noteField')}
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                placeholder={t('ann.notePlaceholder')}
                className={input}
              />
            </label>
          )}

          <div>
            <span className={label}>{t('ann.priority')}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${priority === p ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted'}`}
                >
                  {t(`ann.priorities.${p}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">{t(`ann.priorityHint.${priority}`)}</p>
          </div>

          {isWardRep ? (
            <p className="text-sm">
              {t('ann.audience')}: <b>{user?.ward_id ? wardLabel(user.ward_id) : '—'}</b>
            </p>
          ) : (
            <div>
              <span className={label}>{t('ann.audience')}</span>
              {canCityWide && (
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cityWide} onChange={(e) => setCityWide(e.target.checked)} />
                  {t('ann.cityWide')}
                </label>
              )}
              {!cityWide && (
                <div className="mt-1 grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2 text-xs">
                  {wards.map((w) => (
                    <label key={w.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={wardIds.includes(w.id)}
                        onChange={(e) =>
                          setWardIds((ids) => (e.target.checked ? [...ids, w.id] : ids.filter((id) => id !== w.id)))
                        }
                      />
                      {w.number} · {w.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className={label}>
            {t('ann.validUntil')}
            <input name="valid_until" type="datetime-local" className={input} />
          </label>

          <div>
            <span className={label}>{t('ann.linked')}</span>
            <select
              multiple
              value={linked}
              onChange={(e) => setLinked([...e.target.selectedOptions].map((o) => o.value as Category))}
              className={`${input} h-24`}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}`)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">{t('ann.linkedHint')}</p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {mode === 'write' ? <Send size={15} aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {busy ? t('common.loading') : t(mode === 'write' ? 'ann.post' : 'ann.makeDraft')}
          </button>
        </form>
      </section>

      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('ann.list')}</h2>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />
            {t('ann.showExpired')}
          </label>
        </div>
        {list.isPending ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : list.data?.items.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted shadow-sm">{t('ann.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {list.data?.items.map((a) => (
              <li key={a.id} className={`rounded-xl border-l-4 bg-surface p-4 shadow-sm ${BORDER[a.priority]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.title.en}</div>
                    <div className="text-xs text-muted">
                      {t(`ann.priorities.${a.priority}`)} · {audience(a)} · {formatDateTime(a.valid_from)}
                      {a.valid_until && ` → ${formatDateTime(a.valid_until)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'draft' && (
                      <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {a.ai_drafted ? t('ann.aiDraft') : t('ann.draft')}
                      </span>
                    )}
                    {a.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => publish.mutate(a.id)}
                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        {t('ann.publish')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove.mutate(a.id)}
                      className="text-faint hover:text-danger"
                      aria-label={t('ann.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm">{a.message.en}</p>
                {(a.message.mr || a.message.hi) && (
                  <div className="mt-2 space-y-1 rounded-lg bg-neutral-bg p-2 text-xs text-muted">
                    {a.message.mr && <p>मराठी: {a.title.mr} — {a.message.mr}</p>}
                    {a.message.hi && <p>हिंदी: {a.title.hi} — {a.message.hi}</p>}
                  </div>
                )}
                {a.linked_categories.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted">
                    {t('ann.autoReplies')}: {a.linked_categories.map((c) => t(`category.${c}`)).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
