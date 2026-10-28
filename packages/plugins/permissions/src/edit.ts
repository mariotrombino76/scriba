import {
  AddMarkStep,
  AllSelection,
  CLOSE_HISTORY,
  Mapping,
  RemoveMarkStep,
  TOGGLE_MARK,
  Selection,
  TextSelection,
  TransformError,
  insertContent,
  type Command,
  type EditorState,
  type Fragment,
  type MarkType,
  type Node,
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

/** Whether every piece of text in the range that may carry `type` has it. */
function allMarked(doc: Node, range: { from: number; to: number }, type: MarkType): boolean {
  let all = true
  doc.nodesBetween(range.from, range.to, (node, _pos, parent) => {
    if (!all) return false
    if (node.isText && parent?.type.allowsMarkType(type) && !type.isInSet(node.marks)) all = false
    return true
  })
  return all
}

/** Parts of `from…to` outside protected blocks. */
function unlockedRanges(
  doc: Node,
  from: number,
  to: number,
  locked: (node: Node) => boolean,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  let start = from
  doc.nodesBetween(from, to, (node, pos) => {
    if (!locked(node)) return true
    if (pos > start) out.push({ from: start, to: pos })
    start = Math.max(start, pos + node.nodeSize)
    return false
  })
  if (start < to) out.push({ from: start, to })
  return out
}

/**
 * A formatting change (bold, color…) refused because the selection contains
 * protected blocks: the same marks applied only around them. Null when the
 * transaction does something else, or nothing is left to change.
 */
export function marksAroundLocked(
  tr: Transaction,
  state: EditorState,
  rules: BlockRules,
): Transaction | null {
  if (!tr.steps.every((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep)) return null
  const locked = lockedTest(rules)
  const out = state.tr
  const steps = tr.steps as (AddMarkStep | RemoveMarkStep)[]
  // a toggle (Ctrl+B…) seen as "add" only because the protected text lacks the
  // mark: when all the editable text has it, the user is taking it away
  const toggled = tr.getMeta<string>(TOGGLE_MARK)
  const type = toggled ? state.schema.marks[toggled] : undefined
  if (type && steps.every((s) => s instanceof AddMarkStep && s.mark.type === type)) {
    const { from, to } = state.selection
    const ranges = unlockedRanges(out.doc, from, to, locked)
    if (ranges.length && ranges.every((r) => allMarked(out.doc, r, type)))
      for (const r of ranges) out.removeMark(r.from, r.to, type)
  }
  if (!out.docChanged)
    for (const step of steps) {
      for (const r of unlockedRanges(out.doc, step.from, step.to, locked)) {
        if (step instanceof AddMarkStep) out.addMark(r.from, r.to, step.mark)
        else out.removeMark(r.from, r.to, step.mark)
      }
    }
  if (!out.docChanged) return null
  // marks do not move positions: the same selection and stored marks
  if (tr.selectionSet) out.setSelection(tr.selection.map(out.doc, new Mapping()))
  if (tr.storedMarksSet) out.setStoredMarks(tr.storedMarks)
  return transactionAllowed(out, rules) ? out : null
}
