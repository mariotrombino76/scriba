import type { Translate } from '@scriba-editor/i18n'
import type { MentionItem } from './state.js'

/**
 * Finds people for a query (`""` right after the "@"). Call your backend here;
 * `signal` aborts when the user types on or closes the list.
 */
export type MentionSearch = (query: string, signal: AbortSignal) => Promise<readonly MentionItem[]>

export interface MentionMenuOptions {
  search: MentionSearch
  t: Translate
  /** Pause in typing before searching, in ms (default 150). */
  debounce?: number
  /** Most entries shown (default 8, at most 50). */
  maxResults?: number
  /** A search taking longer fails, in ms (default 10 000). */
  timeout?: number
}
