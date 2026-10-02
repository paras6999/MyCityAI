import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function FullPageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center text-muted" role="status">
      <LoaderCircle className="animate-spin" size={28} aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
