import { en, type MessageKey, type Messages } from './en.js'
import { it } from './it.js'

export { en, it, type MessageKey, type Messages }

/** Translates a key, filling `{name}` placeholders. */
export type Translate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string

/** Built-in locales. Others can be passed as message objects. */
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
