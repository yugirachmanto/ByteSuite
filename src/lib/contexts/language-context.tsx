'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { translate, type Locale } from '@/lib/i18n'

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'bytesuite_locale'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('id')
  const supabase = createClient()

  // Load a cached locale immediately for instant paint, then reconcile
  // against the DB value once the session resolves (DB wins).
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (cached === 'en' || cached === 'id') setLocaleState(cached)
    } catch {
      // localStorage unavailable — fall through to DB-only
    }

    async function loadFromDb() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('locale')
        .eq('id', user.id)
        .single()

      if (profile?.locale === 'en' || profile?.locale === 'id') {
        setLocaleState(profile.locale)
        try {
          localStorage.setItem(STORAGE_KEY, profile.locale)
        } catch {
          // ignore
        }
      }
    }
    loadFromDb()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('user_profiles').update({ locale: next }).eq('id', user.id)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
