import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { getCategorySummary, getDepartmentSummary, getKpis, getWardSummary } from '../api/summary'
import { useAuth } from '../auth/useAuth'
import { CategoryBars } from '../components/summary/CategoryBars'
import { DepartmentTable } from '../components/summary/DepartmentTable'
import { EscalationList } from '../components/summary/EscalationList'
import { KpiCards } from '../components/summary/KpiCards'
import { Section } from '../components/summary/Section'
import { useWards } from '../hooks/useWards'

// The map library is large; load it only on pages that show the heatmap.
const WardHeatmap = lazy(() =>
  import('../components/summary/WardHeatmap').then((m) => ({ default: m.WardHeatmap })),
)

export type OverviewRole = 'officer' | 'ward_rep' | 'mayor'

/** Where each role's queue, escalation inbox and complaint pages live (see App.tsx). */
const ROLE_PATHS: Record<OverviewRole, { queue: string; escalations: string; detail: string }> = {
  officer: { queue: '/officer', escalations: '/officer/escalations', detail: '/officer/complaints' },
  ward_rep: { queue: '/ward/complaints', escalations: '/ward/escalations', detail: '/ward/complaints' },
  mayor: { queue: '/mayor/complaints', escalations: '/mayor/escalations', detail: '/mayor/complaints' },
}

function Placeholder() {
  const { t } = useTranslation()
  return <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
}

/**
 * Ward rep: ward KPIs, escalation inbox, departments, categories.
 * Mayor: city KPIs, ward heatmap, final escalations, department ranking.
 * Officer ("Performance"): department KPIs, categories, escalated complaints.
 */
export function OverviewPage({ role }: { role: OverviewRole }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { byId: wardsById } = useWards()
  const paths = ROLE_PATHS[role]

  const kpis = useQuery({ queryKey: ['summary', 'kpis'], queryFn: () => getKpis() })
  const departments = useQuery({
    queryKey: ['summary', 'departments'],
    queryFn: () => getDepartmentSummary(),
    enabled: role !== 'officer',
  })
  const categories = useQuery({ queryKey: ['summary', 'categories'], queryFn: () => getCategorySummary() })
  const wards = useQuery({
    queryKey: ['summary', 'wards'],
    queryFn: getWardSummary,
    enabled: role === 'mayor',
  })

  const ward = user?.ward_id ? wardsById.get(user.ward_id) : undefined
  let scope = t('home.scopeCity')
  if (role === 'officer' && user?.department) {
    scope = t('home.scopeDepartment', { department: t(`departments.${user.department}`) })
  } else if (role === 'ward_rep') {
    scope = ward ? t('home.scopeWard', { number: ward.number, name: ward.name }) : '…'
  }

  const escalations = (
    <Section
      title={t(role === 'mayor' ? 'overview.finalEscalations' : role === 'ward_rep' ? 'overview.escalationInbox' : 'overview.escalated')}
      link={paths.escalations}
      linkLabel={t('overview.viewAll')}
    >
      <EscalationList detailBase={paths.detail} level={role === 'mayor' ? 2 : undefined} />
    </Section>
  )
  const categoryChart = (
    <Section title={t('overview.categories')}>
      {categories.data ? <CategoryBars items={categories.data} /> : <Placeholder />}
    </Section>
  )
  const departmentTable = (
    <Section
      title={t(role === 'mayor' ? 'overview.departmentRanking' : 'overview.departments')}
      link={role === 'mayor' ? '/mayor/departments' : undefined}
      linkLabel={t('overview.viewAll')}
    >
      {departments.data ? <DepartmentTable items={departments.data} ranked={role === 'mayor'} /> : <Placeholder />}
    </Section>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t(role === 'officer' ? 'nav.performance' : `home.title.${role}`)}</h1>
        <p className="mt-1 text-sm text-muted">{scope}</p>
      </div>

      {kpis.isError ? (
        <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{t('overview.loadError')}</p>
      ) : kpis.data ? (
        <KpiCards kpis={kpis.data} queuePath={paths.queue} escalationsPath={paths.escalations} />
      ) : (
        <Placeholder />
      )}

      {role === 'mayor' && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Section title={t('overview.heatmap')} link="/mayor/wards" linkLabel={t('overview.viewAll')}>
              {wards.data ? (
                <Suspense fallback={<Placeholder />}>
                  <WardHeatmap
                    wards={wards.data}
                    onSelect={(w) => navigate(`${paths.queue}?ward_id=${w.ward_id}`)}
                  />
                </Suspense>
              ) : (
                <Placeholder />
              )}
            </Section>
            {escalations}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {departmentTable}
            {categoryChart}
          </div>
        </>
      )}

      {role === 'ward_rep' && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {escalations}
            {categoryChart}
          </div>
          {departmentTable}
        </>
      )}

      {role === 'officer' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {categoryChart}
          {escalations}
        </div>
      )}
    </div>
  )
}
