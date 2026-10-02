import { Building2, LoaderCircle, LogOut, UserCircle } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { StaffRole } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { NAVIGATION } from './navigation'

export function DashboardLayout({ role }: { role: StaffRole }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col bg-navy px-3 py-5 text-slate-300">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white">
            <Building2 size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-white">{t('app.name')}</div>
            <div className="text-[11px] text-sky-300">{t(`roles.${role}`)}</div>
          </div>
        </div>

        <nav className="space-y-1">
          {NAVIGATION[role].map(({ key, icon: Icon, path, end }) =>
            path ? (
              <NavLink
                key={key}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                    isActive ? 'bg-primary-dark font-semibold text-white' : 'hover:bg-white/5'
                  }`
                }
              >
                <Icon size={17} aria-hidden />
                {t(`nav.${key}`)}
              </NavLink>
            ) : (
              <span
                key={key}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-500"
                title={t('nav.comingSoon')}
              >
                <Icon size={17} aria-hidden />
                {t(`nav.${key}`)}
                <span className="ml-auto rounded bg-white/5 px-1.5 text-[10px] uppercase">
                  {t('nav.soon')}
                </span>
              </span>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 px-6 py-4">
          <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs shadow-sm">
            <UserCircle size={16} className="text-muted" aria-hidden />
            {user?.name ?? t(`roles.${role}`)}
          </span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-text"
          >
            <LogOut size={15} aria-hidden />
            {t('common.logout')}
          </button>
        </header>
        <main className="flex-1 px-6 pb-8">
          <Suspense fallback={<LoaderCircle className="mx-auto mt-16 animate-spin text-muted" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
