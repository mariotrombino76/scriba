import type { KeyBindings, Plugin } from '@scriba-editor/core'
import type { MentionMenuOptions } from './menu.js'
import {
  canOpenMention,
  cleanResults,
  isMentionQuery,
  mentionInsert,
  mentionKey,
  type MentionItem,
} from './state.js'
import { createSuggestion, type Suggestion } from './suggest.js'

export {
  mentionNodes,
  isMentionId,
  isMentionLabel,
  labelFromText,
  MAX_ID_LENGTH,
  MAX_LABEL_LENGTH,
} from './nodes.js'
export {
  mentionKey,
  getMentionState,
  chooseMention,
  closeMention,
  cleanResults,
  isLoading,
  type MentionItem,
  type MentionState,
} from './state.js'
export type { MentionSearch, MentionMenuOptions } from './menu.js'

export {
  createSuggestion,
  type SuggestConfig,
  type SuggestItem,
  type SuggestSearch,
  type SuggestState,
  type Suggestion,
} from './suggest.js'

/** The mention suggestion; created once per options object (the key is shared). */
function mentionSuggestion(options: MentionMenuOptions): Suggestion<MentionItem> {
  const { t } = options
  return createSuggestion<MentionItem>({
    name: 'mention',
    key: mentionKey,
    trigger: '@',
    canOpen: canOpenMention,
    isQuery: isMentionQuery,
    clean: cleanResults,
    insert: mentionInsert,
    search: options.search,
    texts: {
      list: t('mention.label'),
      loading: t('mention.loading'),
      none: t('mention.none'),
      error: t('mention.error'),
    },
    className: 'scriba-mention-menu',
    ...(options.debounce !== undefined ? { debounce: options.debounce } : {}),
    ...(options.maxResults !== undefined ? { maxResults: options.maxResults } : {}),
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
  })
}

/**
 * Mentions: "@" at the start of a line or after a space opens a list of
 * people found by your `search` callback; choosing one inserts a `mention`
 * node (add `mentionNodes` to the schema). Nothing is sent before the user
 * types "@". Use with `mentionKeymap()` at a high priority.
 */
export function mentions(options: MentionMenuOptions): Plugin[] {
  return [mentionSuggestion(options).plugin]
}

/**
 * Keys while the list is open: arrows move, Enter or Tab choose, Escape
 * closes it (the typed text stays). A space right after "@", or after a
 * query that found no one, closes it so normal typing goes on.
 */
export function mentionKeymap(): KeyBindings {
  // the keys only read the shared state: any options do
  return mentionSuggestion({ search: () => Promise.resolve([]), t: (k) => k }).keymap()
}
