import { Building2, CheckCircle2, LoaderCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { homePathFor } from '../auth/roles'
import { ApiStatus } from '../components/ApiStatus'
import { FullPageSpinner } from '../components/FullPageSpinner'

export function LoginPage() {
  const { t } = useTranslation()
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to={homePathFor(user.role)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      const signedIn = await login(String(form.get('username')), String(form.get('password')))
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? homePathFor(signedIn.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError(t('login.errorCredentials'))
      } else if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        setError(t('login.errorNetwork'))
      } else {
        setError(t('login.errorGeneric'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const features = [
    t('login.featurePriority'),
    t('login.featureEscalation'),
    t('login.featureTransparency'),
  ]
  const inputClass =
    'mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-light'

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[44%] flex-col justify-between bg-navy p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Building2 size={22} />
          </span>
          <div>
            <div className="text-lg font-bold">{t('app.name')}</div>
            <div className="text-xs text-sky-300">{t('app.subtitle')}</div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-tight">{t('login.heroTitle')}</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{t('login.heroBody')}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-sky-300" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-slate-400">{t('login.footer')}</div>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
              <Building2 size={22} />
            </span>
            <div>
              <div className="text-lg font-bold">{t('app.name')}</div>
              <div className="text-xs text-muted">{t('app.subtitle')}</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold">{t('login.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('login.description')}</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t('login.username')}
              </span>
              <input name="username" autoComplete="username" required className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {t('login.password')}
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-70"
            >
              {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
              {t('login.submit')}
            </button>
          </form>

          <div className="mt-10 flex justify-center">
            <ApiStatus />
          </div>
        </div>
      </main>
    </div>
  )
}
