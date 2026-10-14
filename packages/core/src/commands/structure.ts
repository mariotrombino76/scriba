import type { NodeType } from '../model/schema.js'
import { TextSelection } from '../state/selection.js'
import type { EditorState } from '../state/state.js'
import { blockRange, findWrapping, liftTarget } from '../transform/structure.js'
import type { Command } from './base.js'

/** Wraps the selected blocks in a node of `type` (e.g. a blockquote). */
export function wrapIn(type: NodeType, attrs?: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    const range = blockRange($from, $to)
    const wrapping = range && findWrapping(range, type, attrs)
    if (!range || !wrapping) return false
    dispatch?.(state.tr.wrap(range, wrapping).scrollIntoView())
    return true
  }
}

/** Moves the selected blocks out of their parent (e.g. out of a blockquote). */
export const lift: Command = (state, dispatch) => {
  const { $from, $to } = state.selection
  const range = blockRange($from, $to)
  const target = range && liftTarget(range)
  if (!range || target === null || target === undefined) return false
  dispatch?.(state.tr.lift(range, target).scrollIntoView())
  return true
}

/**
 * Backspace at the very start of the first block inside a container
 * (blockquote…): take the block out instead of joining it with what comes before.
 */
export const liftEmptyOrFirstBlock: Command = (state, dispatch) => {
  const sel = state.selection
  const $cursor = sel instanceof TextSelection ? sel.$cursor : null
  if (!$cursor || $cursor.parentOffset > 0 || $cursor.depth < 2) return false
  if ($cursor.index($cursor.depth - 1) > 0) return false
  return lift(state, dispatch)
}

/** Toggles a wrapper: lifts out if inside one of `type`, else wraps. */
export function toggleWrap(type: NodeType, attrs?: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === type) {
        // Positions inside the first and last child, so the range covers all of them.
        const $start = state.doc.resolve($from.start(d) + 1)
        const $end = state.doc.resolve($from.end(d) - 1)
        const range = blockRange($start, $end)
        const target = range && liftTarget(range)
        if (!range || target === null || target === undefined) return false
        dispatch?.(state.tr.lift(range, target).scrollIntoView())
        return true
      }
    }
    return wrapIn(type, attrs)(state, dispatch)
  }
}

/** True when the selection is inside a node of `type`. */
export function isInNode(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true
  return false
}

/**
 * Enter in an empty block inside a container (blockquote…): take the block out
 * of the container, so the user can leave it. In the middle, the container splits.
 */
export const liftEmptyBlock: Command = (state, dispatch) => {
  const sel = state.selection
  const $cursor = sel instanceof TextSelection ? sel.$cursor : null
  if (!$cursor || $cursor.parent.content.size || $cursor.depth < 2) return false
  return lift(state, dispatch)
}
