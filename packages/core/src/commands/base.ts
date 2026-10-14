import type { Node } from '../model/node.js'
import type { NodeType } from '../model/schema.js'
import { AllSelection, NodeSelection, Selection, TextSelection } from '../state/selection.js'
import type { EditorState } from '../state/state.js'
import type { Transaction } from '../state/transaction.js'
import { deleteRangeSlice } from '../transform/delete-range.js'

/**
 * A command: a pure function of the state. Without `dispatch` it only tells
 * whether it could run (used to enable/disable toolbar buttons).
 */
export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean

/** Runs the first command that succeeds. */
export function chainCommands(...commands: Command[]): Command {
  return (state, dispatch) => commands.some((cmd) => cmd(state, dispatch))
}

/** True when deleting [from, to) is possible without breaking the schema. */
function canDelete(state: EditorState, from: number, to: number): boolean {
  return !!deleteRangeSlice(state.doc.resolve(from), state.doc.resolve(to))
}

/** Deletes the selection, if not empty. */
export const deleteSelection: Command = (state, dispatch) => {
  const sel = state.selection
  if (sel.empty) return false
  if (!(sel instanceof AllSelection) && !canDelete(state, sel.from, sel.to)) return false
  dispatch?.(state.tr.deleteSelection().scrollIntoView())
  return true
}

function cursorAtBlockEdge(state: EditorState, edge: 'start' | 'end'): TextSelection['$cursor'] {
  const sel = state.selection
  if (!(sel instanceof TextSelection)) return null
  const $cursor = sel.$cursor
  if (!$cursor) return null
  const atEdge =
    edge === 'start'
      ? $cursor.parentOffset === 0
      : $cursor.parentOffset === $cursor.parent.content.size
  return atEdge ? $cursor : null
}

/**
 * Backspace at the start of a textblock: joins it with the previous textblock
 * (at any depth), or deletes a selectable block atom right before it.
 * At the start of the document, turns a non-default block (e.g. a heading) into the default one.
 */
export const joinBackward: Command = (state, dispatch) => {
  const $cursor = cursorAtBlockEdge(state, 'start')
  if (!$cursor) return false
  const before = Selection.findFrom(state.doc.resolve($cursor.before()), -1)
  if (!before) return resetBlockType(state, dispatch, $cursor.before())
  if (before instanceof NodeSelection) {
    if (!canDelete(state, before.from, before.to)) return false
    dispatch?.(state.tr.delete(before.from, before.to).scrollIntoView())
    return true
  }
  const target = before.head
  if (!canDelete(state, target, $cursor.pos)) return false
  if (dispatch) {
    const tr = state.tr.delete(target, $cursor.pos)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, target)).scrollIntoView())
  }
  return true
}

/** Delete at the end of a textblock: pulls the next textblock into this one. */
export const joinForward: Command = (state, dispatch) => {
  const $cursor = cursorAtBlockEdge(state, 'end')
  if (!$cursor) return false
  const after = Selection.findFrom(state.doc.resolve($cursor.after()), 1)
  if (!after) return false
  if (after instanceof NodeSelection) {
    if (!canDelete(state, after.from, after.to)) return false
    dispatch?.(state.tr.delete(after.from, after.to).scrollIntoView())
    return true
  }
  if (!canDelete(state, $cursor.pos, after.head)) return false
  if (dispatch) {
    const tr = state.tr.delete($cursor.pos, after.head)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, $cursor.pos)).scrollIntoView())
  }
  return true
}

function resetBlockType(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  pos: number,
): boolean {
  const $pos = state.doc.resolve(pos)
  const block = $pos.nodeAfter
  const parent = $pos.parent
  const match = parent.type.contentExpr.matchFragment(parent.content, undefined, 0, $pos.index())
  const def = match && parent.type.contentExpr.defaultType(match)
  if (!block || !def || !def.isTextblock || block.type === def) return false
  dispatch?.(state.tr.setBlockType(pos, pos + block.nodeSize, def))
  return true
}

/** Deletes one grapheme (user-perceived character) before or after the cursor. */
export function deleteChar(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof TextSelection) || !sel.$cursor) return false
    const $c = sel.$cursor
    const text = blockText($c.parent)
    const offset = $c.parentOffset
    if (dir < 0 ? offset === 0 : offset === text.length) return false
    const size = graphemeSize(text, offset, dir)
    const from = dir < 0 ? $c.pos - size : $c.pos
    if (dispatch) dispatch(state.tr.delete(from, from + size).scrollIntoView())
    return true
  }
}

/** Text of a textblock where every inline leaf counts as one placeholder char (keeps positions aligned). */
function blockText(block: Node): string {
  let text = ''
  block.forEach((child) => (text += child.isText ? child.text : '\ufffc'))
  return text
}

function codePointStarts(text: string): number[] {
  const starts: number[] = []
  let index = 0
  for (const ch of text) {
    starts.push(index)
    index += ch.length
  }
  return starts
}

/** Length of the grapheme before (dir -1) or after (dir 1) `offset`. */
function graphemeSize(text: string, offset: number, dir: -1 | 1): number {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  const starts = Segmenter
    ? [...new Segmenter().segment(text)].map((s) => s.index)
    : codePointStarts(text)
  starts.push(text.length)
  if (dir < 0) {
    const prev = starts.filter((i) => i < offset).at(-1) ?? 0
    return offset - prev
  }
  const next = starts.find((i) => i > offset) ?? text.length
  return next - offset
}

/** Enter inside a code block inserts a newline. */
export const newlineInCode: Command = (state, dispatch) => {
  const { $head, $anchor } = state.selection
  if (!$head.parent.type.spec.code || !$head.sameParent($anchor)) return false
  dispatch?.(state.tr.insertText('\n').scrollIntoView())
  return true
}

function defaultBlockAfter(
  $pos: { node(d?: number): Node; indexAfter(d?: number): number },
  depth: number,
): NodeType | null {
  const parent = $pos.node(depth)
  const expr = parent.type.contentExpr
  const match = expr.matchFragment(parent.content, undefined, 0, $pos.indexAfter(depth))
  return match ? expr.defaultType(match) : null
}

/** Enter: splits the textblock at the cursor (deleting the selection first). */
export const splitBlock: Command = (state, dispatch) => {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.isBlock) return false
  const { $from, $to } = sel
  if (!$from.parent.inlineContent || !$to.parent.inlineContent) return false
  if (dispatch) {
    const tr = state.tr
    if (!sel.empty) tr.deleteSelection()
    const $pos = tr.selection.$from
    const atEnd = $pos.parentOffset === $pos.parent.content.size
    const typeAfter = atEnd ? defaultBlockAfter($pos, $pos.depth - 1) : null
    tr.split($pos.pos, 1, typeAfter ? [{ type: typeAfter }] : undefined)
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Selects the whole document. */
export const selectAll: Command = (state, dispatch) => {
  dispatch?.(state.tr.setSelection(new AllSelection(state.doc)))
  return true
}

/** Inserts a node (e.g. a hard break) replacing the selection, if the schema allows it there. */
export function insertNode(type: NodeType, attrs?: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    if (!$from.parent.type.canContain(type)) return false
    if (dispatch) dispatch(state.tr.replaceSelectionWith(type.create(attrs)).scrollIntoView())
    return true
  }
}

/** Changes the selected textblocks to the given type. */
export function setBlockType(type: NodeType, attrs?: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    let applicable = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (applicable) return false
      if (!node.isTextblock) return true
      if (node.hasMarkup(type, type.computeAttrs(attrs))) return false
      const $pos = state.doc.resolve(pos)
      applicable = $pos.parent.type.canContain(type)
      return false
    })
    if (!applicable) return false
    dispatch?.(state.tr.setBlockType(from, to, type, attrs).scrollIntoView())
    return true
  }
}
