import type { Command, KeyBindings, Plugin } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { openFindPanel, type FindReplaceOptions } from './panel.js'
import { findPlugin } from './state.js'

export {
  compileQuery,
  searchTexts,
  expandReplacement,
  MAX_QUERY_LENGTH,
  DEFAULT_MAX_MATCHES,
  type SearchQuery,
  type SearchResult,
  type RawMatch,
  type QueryError,
} from './search.js'
export {
  SearchRunner,
  WORKER_POLICY,
  type SearchOutcome,
  type SearchRunnerOptions,
} from './runner.js'
export {
  findKey,
  getFindState,
  blockTexts,
  toMatches,
  type Match,
  type FindState,
} from './state.js'
export { FindPanel, openFindPanel, type FindReplaceOptions } from './panel.js'

/**
 * Find and replace: highlights (plugin state + decorations). Add the panel
 * with `findReplaceKeymap` (Ctrl/Cmd+F) and/or `findReplaceToolbarItem`.
 * Regular expressions run in a Web Worker with a time limit (§5.10); if your
 * CSP has a `trusted-types` directive, allow the `scriba-worker` policy.
 */
export function findReplacePlugins(): Plugin[] {
  return [findPlugin()]
}

/**
 * Ctrl/Cmd+F opens the panel (instead of the browser's search, which cannot
 * replace). Register with `readOnly: true`: searching works in read-only too.
 */
export function findReplaceKeymap(t: Translate, options: FindReplaceOptions = {}): KeyBindings {
  const open: Command = (_state, dispatch, view) => {
    if (!view) return false
    if (dispatch) openFindPanel(view as EditorView, t, options)
    return true
  }
  return { 'Mod-f': open }
}

export function findReplaceToolbarItem(
  t: Translate,
  options: FindReplaceOptions = {},
): ToolbarButton {
  return {
    type: 'button',
    id: 'find',
    icon: 'search',
    label: (tr) => tr('find.button'),
    shortcut: 'Mod-f',
    command: () => true,
    run: (view) => openFindPanel(view, t, options),
    readOnly: true, // replacing stays disabled in read-only
  }
}
