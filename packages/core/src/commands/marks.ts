import type { MarkType } from '../model/schema.js'
import { TextSelection } from '../state/selection.js'
import type { EditorState } from '../state/state.js'
import type { Command } from './base.js'

/** True when some selected inline content may carry the mark. */
function markApplies(state: EditorState, type: MarkType): boolean {
  const { $from, from, to, empty } = state.selection
  if (empty) return $from.parent.inlineContent && $from.parent.type.allowsMarkType(type)
  let applies = false
  state.doc.nodesBetween(from, to, (node) => {
    if (applies) return false
    if (node.inlineContent && node.type.allowsMarkType(type)) applies = true
    return !applies
  })
  return applies
}

/**
 * True when the mark is active: at the cursor (stored marks or cursor marks),
 * or across all selected text. Used for `aria-pressed` on toolbar buttons.
 */
export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks())
  let hasText = false
  let all = true
  state.doc.nodesBetween(from, to, (node) => {
    if (!all) return false
    if (node.isText) {
      hasText = true
      if (!type.isInSet(node.marks)) all = false
    }
    return true
  })
  return hasText && all
}

/**
 * Meta set by `toggleMark` on its transaction (the mark type's name): a plugin
 * that adjusts the change (e.g. around protected blocks) knows it is a toggle.
 */
export const TOGGLE_MARK = 'toggleMark'

/**
 * Toggles a mark. With a cursor it changes the stored marks (affecting the next
 * typed text); with a range it removes the mark if the range is fully marked,
 * otherwise adds it.
 */
export function toggleMark(type: MarkType, attrs?: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!markApplies(state, type)) return false
    if (!dispatch) return true
    const tr = state.tr
    if (sel instanceof TextSelection && sel.$cursor) {
      if (isMarkActive(state, type)) tr.removeStoredMark(type)
      else tr.addStoredMark(type.create(attrs))
    } else if (isMarkActive(state, type)) {
      tr.removeMark(sel.from, sel.to, type)
    } else {
      tr.addMark(sel.from, sel.to, type.create(attrs))
    }
    dispatch(tr.setMeta(TOGGLE_MARK, type.name).scrollIntoView())
    return true
  }
}
