import { useQuery } from '@tanstack/react-query'
import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { StaffRole } from '../api/types'
import { getWards } from '../api/wards'
import { useAuth } from '../auth/useAuth'

/**
 * Landing page for each role. Phase 1 only confirms who is signed in;
 * the real views (queue, ward overview, city overview) replace this from Phase 2.
 */
export function RoleHomePage({ role }: { role: StaffRole }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: wards } = useQuery({
    queryKey: ['wards'],
    queryFn: getWards,
    enabled: role === 'ward_rep',
  })
  const ward = wards?.find((w) => w.id === user?.ward_id)

  let scope = t('home.scopeCity')
  if (role === 'officer' && user?.department) {
    scope = t('home.scopeDepartment', { department: t(`departments.${user.department}`) })
  } else if (role === 'ward_rep') {
    scope = ward ? t('home.scopeWard', { number: ward.number, name: ward.name }) : '…'
  }

  return (
    <div>
      <h1 className="text-xl font-bold">{t(`home.title.${role}`)}</h1>
      <p className="mt-1 text-sm text-muted">{scope}</p>

      <div className="mt-6 flex items-start gap-4 rounded-xl bg-surface p-6 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
          <Construction size={20} aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">{t('home.comingTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t(`home.coming.${role}`)}</p>
        </div>
      </div>
    </div>
  )
}
