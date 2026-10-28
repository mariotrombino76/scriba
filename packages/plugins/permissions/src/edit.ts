import {
  AllSelection,
  CLOSE_HISTORY,
  Selection,
  TextSelection,
  TransformError,
  insertContent,
  type Command,
  type EditorState,
  type Fragment,
  type Transaction,
} from '@scriba/core'
import { lockedTest, transactionAllowed, type BlockRules } from './check.js'

/*
 * Editing a selection that contains protected blocks.
 *
 * Simple picture: select a page with a locked paragraph in the middle and
 * type "x". Instead of refusing everything, the text around the locked
 * paragraph is deleted, the locked paragraph stays where it was, and "x"
 * goes where the selection started.
 */

/**
 * Deletes `from…to` except the protected blocks in it (a block only partly
 * selected is kept whole). Returns where the deleted content started (a
 * place for text, created when needed), or null when there is no protected
 * block in the range or the result would still change one.
 */
export function deleteKeepingLocked(
  tr: Transaction,
  from: number,
  to: number,
  rules: BlockRules,
): number | null {
  const locked = lockedTest(rules)
  const kept: { from: number; to: number }[] = []
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!locked(node)) return true
    kept.push({ from: pos, to: pos + node.nodeSize })
    return false // its content is part of it
  })
  // a range starting or ending inside a protected block: that block is kept too
  for (const pos of [from, to]) {
    const $pos = tr.doc.resolve(pos)
    for (let d = 1; d <= $pos.depth; d++)
      if (locked($pos.node(d)) && !kept.some((k) => k.from === $pos.before(d)))
        kept.push({ from: $pos.before(d), to: $pos.after(d) })
  }
  if (!kept.length) return null
  kept.sort((a, b) => a.from - b.from)

  // the pieces between them stop inside the neighbouring text: deleting up to a
  // block boundary would join the protected block with the text next to it
  const doc = tr.doc
  const pieces: { from: number; to: number }[] = []
  /** Textblocks whose whole text is deleted: removed afterwards if left empty. */
  const emptied: number[] = []
  const add = (a: number, b: number) => {
    if (!doc.resolve(a).parent.inlineContent) a = Selection.near(doc.resolve(a), 1).from
    if (!doc.resolve(b).parent.inlineContent) b = Selection.near(doc.resolve(b), -1).to
    if (a >= b) return
    pieces.push({ from: a, to: b })
    const $a = doc.resolve(a)
    // all of its text selected (a browser's "select all" ends inside the last block)
    if ($a.depth > 0 && from <= $a.start() && a === $a.start() && b >= $a.end())
      emptied.push($a.before())
  }
  let start = from
  for (const k of kept) {
    if (k.from > start) add(start, Math.min(k.from, to))
    start = Math.max(start, k.to)
  }
  if (start < to) add(start, to)
  if (!pieces.length) return null

  const steps = tr.steps.length
  try {
    // the last piece first: the positions of the others do not move
    for (const piece of [...pieces].reverse()) tr.delete(piece.from, piece.to)
  } catch (e) {
    if (e instanceof TransformError) return null
    throw e
  }
  let caret = tr.mapping.slice(steps).map(pieces[0]!.from, -1)
  // the other wholly selected blocks go away too (the first one keeps the caret)
  const caretBlock = tr.doc.resolve(caret).depth > 0 ? tr.doc.resolve(caret).before() : -1
  for (const pos of emptied.reverse()) {
    const at = tr.mapping.slice(steps).map(pos, 1)
    const node = tr.doc.nodeAt(at)
    if (at === caretBlock || !node?.isTextblock || node.content.size) continue
    try {
      tr.delete(at, at + node.nodeSize)
    } catch (e) {
      if (!(e instanceof TransformError)) throw e
    }
  }
  caret = tr.mapping.slice(steps).map(pieces[0]!.from, -1)
  const paragraph = tr.doc.type.schema.nodes['paragraph']
  if (!tr.doc.resolve(caret).parent.inlineContent && paragraph) {
    // e.g. everything before a protected block was deleted: a new paragraph for the text
    try {
      tr.insert(caret, paragraph.create())
      caret += 1
    } catch (e) {
      if (!(e instanceof TransformError)) throw e
    }
  }
  // its own undo step: deleting a selection is not more typing
  tr.setMeta(CLOSE_HISTORY, true)
  return transactionAllowed(tr, rules) ? caret : null
}

/** The selection as a range to edit, when it is text (or everything) and not empty. */
function selectedRange(state: EditorState): { from: number; to: number } | null {
  const sel = state.selection
  if (sel.empty || !(sel instanceof TextSelection || sel instanceof AllSelection)) return null
  return { from: sel.from, to: sel.to }
}

/** Deletes the selection except its protected blocks; false when it has none. */
export function deleteSelectionKeepingLocked(rules: BlockRules): Command {
  return (state, dispatch) => {
    const range = selectedRange(state)
    if (!range) return false
    const tr = state.tr
    const caret = deleteKeepingLocked(tr, range.from, range.to, rules)
    if (caret === null) return false
    tr.setSelection(Selection.near(tr.doc.resolve(caret)))
    dispatch?.(tr.scrollIntoView())
    return true
  }
}

/** Typing over `from…to`: the text replaces what can be deleted. Null when nothing is protected. */
export function typeKeepingLocked(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  rules: BlockRules,
): Transaction | null {
  if (from >= to) return null
  const tr = state.tr
  const caret = deleteKeepingLocked(tr, from, to, rules)
  if (caret === null) return null
  tr.insertText(text, caret)
  tr.setSelection(TextSelection.create(tr.doc, caret + text.length))
  return transactionAllowed(tr, rules) ? tr.scrollIntoView() : null
}

/** Pasting over the selection: the content replaces what can be deleted. */
export function pasteKeepingLocked(
  state: EditorState,
  content: Fragment,
  rules: BlockRules,
): Transaction | null {
  const range = selectedRange(state)
  if (!range) return null
  const tr = state.tr
  const caret = deleteKeepingLocked(tr, range.from, range.to, rules)
  if (caret === null) return null
  const end = insertContent(tr, caret, caret, content)
  if (end === null) return null
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
  return transactionAllowed(tr, rules) ? tr.scrollIntoView() : null
}
