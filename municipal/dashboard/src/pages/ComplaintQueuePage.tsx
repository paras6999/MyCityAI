import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { type ComplaintFilters, listComplaints } from '../api/complaints'
import { CATEGORIES, type Category, STATUSES, type Status } from '../api/types'
import { PriorityBadge } from '../components/PriorityBadge'
import { SlaLabel } from '../components/SlaLabel'
import { StatusChip } from '../components/StatusChip'
import { useWards } from '../hooks/useWards'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 20

/**
 * AI-sorted complaint queue. The backend already limits results to what the user may see
 * (officer: own department, ward rep: own ward), so the same page serves both roles.
 */
export function ComplaintQueuePage({ titleKey, detailBase }: { titleKey: string; detailBase: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { byId: wards } = useWards()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')

  const filters: ComplaintFilters = {
    status: (params.get('status') as Status) || undefined,
    category: (params.get('category') as Category) || undefined,
    sla: (params.get('sla') as ComplaintFilters['sla']) || undefined,
    q: params.get('q') || undefined,
    sort: (params.get('sort') as ComplaintFilters['sort']) || 'priority',
    page: Number(params.get('page') ?? 1),
    page_size: PAGE_SIZE,
  }

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  // Apply the search box 300 ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) setFilter('q', search.trim() || null)
    }, 300)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps -- only react to typing

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['complaints', filters],
    queryFn: () => listComplaints(filters),
    placeholderData: keepPreviousData,
  })

  const page = filters.page ?? 1
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const selectClass =
    'rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-primary'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t(titleKey)}</h1>
          <p className="mt-1 text-sm text-muted">{t('queue.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-muted shadow-sm hover:text-text"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden />
          {t('queue.refresh')}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 rounded-xl bg-surface p-3 shadow-sm">
        <label className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-2.5 top-2.5 text-faint" aria-hidden />
          <span className="sr-only">{t('queue.search')}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('queue.searchPlaceholder')}
            className="w-full rounded-lg border border-border py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <select
          aria-label={t('queue.status')}
          value={filters.status ?? ''}
          onChange={(event) => setFilter('status', event.target.value || null)}
          className={selectClass}
        >
          <option value="">{t('queue.allStatuses')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('queue.category')}
          value={filters.category ?? ''}
          onChange={(event) => setFilter('category', event.target.value || null)}
          className={selectClass}
        >
          <option value="">{t('queue.allCategories')}</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`category.${category}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('queue.sla')}
          value={filters.sla ?? ''}
          onChange={(event) => setFilter('sla', event.target.value || null)}
          className={selectClass}
        >
          <option value="">{t('queue.anySla')}</option>
          <option value="overdue">{t('queue.overdue')}</option>
          <option value="due_soon">{t('queue.dueSoon')}</option>
        </select>
        <select
          aria-label={t('queue.sort')}
          value={filters.sort}
          onChange={(event) => setFilter('sort', event.target.value)}
          className={selectClass}
        >
          <option value="priority">{t('queue.sortPriority')}</option>
          <option value="sla_due_at">{t('queue.sortSla')}</option>
          <option value="created_at">{t('queue.sortNewest')}</option>
        </select>
      </div>

      <div className="relative mt-4 overflow-x-auto rounded-xl bg-surface shadow-sm">
        {isError ? (
          <div className="flex items-center justify-between gap-3 bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('queue.loadError')}
            <button type="button" onClick={() => refetch()} className="font-semibold underline">
              {t('common.retry')}
            </button>
          </div>
        ) : isPending ? (
          <p className="px-4 py-10 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted">
            <Inbox size={28} className="text-faint" aria-hidden />
            {t('queue.empty')}
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted">
                <th className="px-4 py-2.5">{t('queue.col.code')}</th>
                <th className="px-4 py-2.5">{t('queue.col.issue')}</th>
                <th className="px-4 py-2.5">{t('queue.col.ward')}</th>
                <th className="px-4 py-2.5">{t('queue.col.reports')}</th>
                <th className="px-4 py-2.5">{t('queue.col.priority')}</th>
                <th className="px-4 py-2.5">{t('queue.col.sla')}</th>
                <th className="px-4 py-2.5">{t('queue.col.status')}</th>
                <th className="px-4 py-2.5">{t('queue.col.reported')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((complaint) => {
                const ward = complaint.location.ward_id
                  ? wards.get(complaint.location.ward_id)
                  : undefined
                return (
                  <tr
                    key={complaint.id}
                    onClick={() =>
                      navigate(`${detailBase}/${complaint.id}`, {
                        state: { from: location.pathname + location.search },
                      })
                    }
                    className="cursor-pointer border-b border-neutral-bg last:border-0 hover:bg-primary-light/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                      {complaint.code}
                    </td>
                    <td className="max-w-72 px-4 py-3">
                      <div className="font-medium">{t(`category.${complaint.category}`)}</div>
                      <div className="truncate text-xs text-muted">{complaint.description}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {ward ? `${ward.number} · ${ward.name}` : '—'}
                    </td>
                    <td className="px-4 py-3">{complaint.duplicate_count + 1}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge
                        score={complaint.priority_score}
                        level={complaint.priority_level}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <SlaLabel dueAt={complaint.sla_due_at} status={complaint.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={complaint.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDateTime(complaint.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{t('queue.count', { count: data.total })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setFilter('page', String(page - 1))}
              className="rounded-md p-1.5 hover:bg-surface disabled:opacity-40"
              aria-label={t('queue.previous')}
            >
              <ChevronLeft size={16} />
            </button>
            {t('queue.pageOf', { page, last: lastPage })}
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setFilter('page', String(page + 1))}
              className="rounded-md p-1.5 hover:bg-surface disabled:opacity-40"
              aria-label={t('queue.next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
