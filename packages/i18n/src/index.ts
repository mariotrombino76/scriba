import { en, type MessageKey, type Messages } from './en.js'
import { it } from './it.js'

export { en, it, type MessageKey, type Messages }
/**
 * French, German, Spanish: imported only when used (pass the object, e.g.
 * `createTranslator(fr)`), so the other languages stay out of your bundle.
 */
export { fr } from './fr.js'
export { de } from './de.js'
export { es } from './es.js'

/** Translates a key, filling `{name}` placeholders. */
export type Translate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string

/**
 * Locales found by name in `createTranslator('it')`. The others (`fr`, `de`,
 * `es` or your own) are passed as message objects.
 */
export const locales: Readonly<Record<string, Messages>> = { it, en }

/**
 * Creates a translator. Unknown locales fall back to English; `overrides`
 * replace single messages. Params are plain text, never markup.
 */
export function createTranslator(
  locale: string | Messages = 'en',
  overrides: Partial<Messages> = {},
): Translate {
  const base =
    typeof locale === 'string' ? (locales[locale] ?? locales[locale.split('-')[0]!] ?? en) : locale
  const messages: Messages = { ...en, ...base, ...overrides }
  return (key, params) => {
    const template = messages[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
  }
}
