import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getLocales } from 'expo-localization'
import { storage } from '../lib/storage'
import type { Language } from '../api/types'
import en, { type TranslationKey } from './en'
import hi from './hi'
import mr from './mr'

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, hi, mr }
const LANGUAGE_KEY = 'mycityai.language'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
]

export type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string

interface I18nValue {
  language: Language
  setLanguage: (language: Language) => void
  t: TFunction
}

const I18nContext = createContext<I18nValue | null>(null)

function isLanguage(value: string | null | undefined): value is Language {
  return value === 'en' || value === 'hi' || value === 'mr'
}

function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode
    return isLanguage(code) ? code : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(deviceLanguage)

  useEffect(() => {
    storage.get(LANGUAGE_KEY).then((saved) => {
      if (isLanguage(saved)) setLanguageState(saved)
    })
  }, [])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    void storage.set(LANGUAGE_KEY, next)
  }, [])

  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[language]
    const t: TFunction = (key, params) => {
      let text = dictionary[key] ?? en[key] ?? key
      for (const [name, replacement] of Object.entries(params ?? {})) {
        text = text.replace(`{${name}}`, String(replacement))
      }
      return text
    }
    return { language, setLanguage, t }
  }, [language, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
