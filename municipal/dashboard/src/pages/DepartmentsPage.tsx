import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getDepartmentSummary } from '../api/summary'
import { DepartmentTable } from '../components/summary/DepartmentTable'
import { Section } from '../components/summary/Section'

/** Mayor: departments ranked by resolution rate (fewer SLA breaches breaks ties). */
export function DepartmentsPage() {
  const { t } = useTranslation()
  const { data, isError } = useQuery({
    queryKey: ['summary', 'departments'],
    queryFn: () => getDepartmentSummary(),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('nav.departments')}</h1>
        <p className="mt-1 text-sm text-muted">{t('overview.rankingHint')}</p>
      </div>
      {isError && <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{t('overview.loadError')}</p>}
      <Section title={t('overview.departmentRanking')}>
        {data ? (
          <DepartmentTable items={data} ranked />
        ) : (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
        )}
      </Section>
    </div>
  )
}
