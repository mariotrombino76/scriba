import type { Command, KeyBindings, Plugin } from '@scriba/core'
import type { EditorView } from '@scriba/view'
import type { MentionMenuOptions } from './menu.js'
import {
  chooseMention,
  closeMention,
  getMentionState,
  isLoading,
  mentionKey,
  mentionPlugin,
} from './state.js'

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

/**
 * Mentions: "@" at the start of a line or after a space opens a list of
 * people found by your `search` callback; choosing one inserts a `mention`
 * node (add `mentionNodes` to the schema). Nothing is sent before the user
 * types "@". Use with `mentionKeymap()` at a high priority.
 */
export function mentions(options: MentionMenuOptions): Plugin[] {
  return [mentionPlugin(options)]
}

/**
 * Keys while the list is open: arrows move, Enter or Tab choose, Escape
 * closes it (the typed text stays). A space right after "@", or after a
 * query that found no one, closes it so normal typing goes on.
 */
export function mentionKeymap(): KeyBindings {
  const move =
    (dir: 1 | -1): Command =>
    (state, dispatch) => {
      const s = getMentionState(state)
      if (!s.active || !s.results.length) return false
      const n = s.results.length
      dispatch?.(
        state.tr.setMeta(mentionKey, { ...s, index: (Math.min(s.index, n - 1) + dir + n) % n }),
      )
      return true
    }
  const choose: Command = (state, dispatch, view) => {
    const s = getMentionState(state)
    if (!s.active || !s.results.length || !view) return false
    if (dispatch)
      chooseMention(view as EditorView, s.results[Math.min(s.index, s.results.length - 1)]!)
    return true
  }
  const close: Command = (state, dispatch) => {
    if (!getMentionState(state).active) return false
    dispatch?.(closeMention(state.tr))
    return true
  }
  const space: Command = (state, dispatch) => {
    const s = getMentionState(state)
    if (!s.active || (s.query && (isLoading(s) || s.results.length))) return false
    dispatch?.(closeMention(state.tr))
    return false // the space is typed as usual
  }
  return {
    ArrowDown: move(1),
    ArrowUp: move(-1),
    Enter: choose,
    Tab: choose,
    Escape: close,
    ' ': space,
  }
}
