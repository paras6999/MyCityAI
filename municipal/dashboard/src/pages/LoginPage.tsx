import { Building2, CheckCircle2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiStatus } from '../components/ApiStatus'

export function LoginPage() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(t('login.notYetAvailable'))
  }

  const features = [
    t('login.featurePriority'),
    t('login.featureEscalation'),
    t('login.featureTransparency'),
  ]

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
              <input
                name="username"
                autoComplete="username"
                required
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
              />
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
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
              />
            </label>

            {message && (
              <p role="status" className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
                {message}
              </p>
            )}

            <button
              type="submit"
              className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark"
            >
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
