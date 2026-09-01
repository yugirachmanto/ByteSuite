import { en } from './dictionaries/en'
import { id } from './dictionaries/id'

export type Locale = 'en' | 'id'

export const dictionaries: Record<Locale, Record<string, any>> = { en, id }

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj)
}

/**
 * Dot-path dictionary lookup with {{placeholder}} interpolation. Falls back
 * to the raw key (not a crash) when a translation is missing, so a
 * not-yet-migrated or mistyped key is visible instead of hidden — useful
 * while the i18n rollout is still module-by-module.
 */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[locale] || dictionaries.id
  let value = getPath(dict, key)

  if (value === undefined) {
    value = getPath(dictionaries.id, key)
  }

  if (typeof value !== 'string') {
    return key
  }

  if (!params) return value

  return Object.keys(params).reduce(
    (str, paramKey) => str.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(params[paramKey])),
    value
  )
}
