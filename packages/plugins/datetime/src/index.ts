import { TextSelection, type Command } from '@scriba/core'
import type { ToolbarMenu } from '@scriba/ui'

/** A format: options for `Intl.DateTimeFormat`, or an ISO form (`2026-10-19`, `14:05:09`). */
export type DateTimeFormat = Intl.DateTimeFormatOptions | 'iso-date' | 'iso-time'

export interface DateTimeOptions {
  /** Language of the formats (default: the page's `lang`, else the browser's). */
  locale?: string
  /** The choices, in order (default: like TinyMCE's: time, ISO date, long date, short date). */
  formats?: readonly DateTimeFormat[]
  /** The clock (for tests). */
  now?: () => Date
}

export const DEFAULT_FORMATS: readonly DateTimeFormat[] = [
  { timeStyle: 'medium' },
  'iso-date',
  { dateStyle: 'long' },
  { dateStyle: 'short' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** A date as text in one of the formats (local time). */
export function formatDateTime(date: Date, format: DateTimeFormat, locale?: string): string {
  if (format === 'iso-date')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (format === 'iso-time')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return new Intl.DateTimeFormat(locale, format).format(date)
}

/**
 * Types `text` at the cursor, replacing the selection, as plain text (like
 * TinyMCE's default: no `<time>` element), in any text including code.
 */
export function insertText(text: string): Command {
  return (state, dispatch) => {
    if (!state.selection.$from.parent.inlineContent || !text) return false
    if (dispatch) {
      const tr = state.tr
      if (!(tr.selection instanceof TextSelection) && !tr.selection.empty) tr.deleteSelection()
      dispatch(tr.insertText(text).scrollIntoView())
    }
    return true
  }
}

/**
 * "Date/time" menu (Insert menu, like TinyMCE's): one entry per format,
 * showing the current date or time in it, computed when the menu opens.
 */
export function dateTimeMenu(options: DateTimeOptions = {}): ToolbarMenu {
  const now = options.now ?? (() => new Date())
  const locale = () => options.locale ?? (globalThis.document?.documentElement.lang || undefined)
  const text = (format: DateTimeFormat) => formatDateTime(now(), format, locale())
  return {
    type: 'menu',
    id: 'datetime',
    icon: 'clock',
    label: (t) => t('datetime.label'),
    entries: (options.formats ?? DEFAULT_FORMATS).map((format, i) => ({
      id: `datetime_${i}`,
      label: () => text(format),
      live: true,
      command: (state, dispatch, view) => insertText(text(format))(state, dispatch, view),
    })),
  }
}
