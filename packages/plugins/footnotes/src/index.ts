import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
  type KeyBindings,
  type Node,
  type Schema,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import { newFootnoteKey, syncFootnotes } from './sync.js'

export { footnoteNodes, FOOTNOTES_CLASS, MAX_FOOTNOTES } from './nodes.js'
export { footnotes, syncFootnotes } from './sync.js'

/** Where the note with `key` is: the end of its text (for the cursor). */
function noteEnd(doc: Node, key: string): number | null {
  let end: number | null = null
  doc.descendants((node, pos) => {
    if (end !== null) return false
    if (node.type.name === 'footnote' && node.attrs['key'] === key) end = pos + node.nodeSize - 2
    return node.type.name !== 'footnote_ref'
  })
  return end
}

/** The position of the reference with `key`. */
function refPos(doc: Node, key: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === 'footnote_ref' && node.attrs['key'] === key) found = pos
  })
  return found
}

/**
 * Inserts a footnote reference at the cursor and its note in the list at the
 * end (numbers follow the order); the cursor goes into the note.
 */
export function insertFootnote(schema: Schema): Command {
  const type = schema.nodes['footnote_ref']
  if (!type) throw new RangeError('The schema has no footnotes (add footnoteNodes)')
  return (state, dispatch) => {
    const { $from } = state.selection
    if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false
    for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'footnote') return false
    if (!$from.parent.type.canContain(type)) return false
    if (dispatch) {
      const key = newFootnoteKey()
      const tr = state.tr.replaceSelectionWith(type.create({ key }), false)
      syncFootnotes(tr, schema)
      const end = noteEnd(tr.doc, key)
      if (end !== null) tr.setSelection(TextSelection.create(tr.doc, end))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** The reference selected, or the note the cursor is in, with its key. */
function current(state: EditorState): { key: string; inNote: boolean } | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'footnote_ref')
    return { key: sel.node.attrs['key'] as string, inNote: false }
  const { $from } = sel
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'footnote') return { key: node.attrs['key'] as string, inNote: true }
  }
  return null
}

/** From a selected reference to its note, and from a note back to its reference. */
export const goToFootnote: Command = (state, dispatch) => {
  const at = current(state)
  if (!at) return false
  const target = at.inNote ? refPos(state.doc, at.key) : noteEnd(state.doc, at.key)
  if (target === null) return false
  if (dispatch) {
    const sel = at.inNote
      ? NodeSelection.create(state.doc, target)
      : TextSelection.create(state.doc, target)
    dispatch(state.tr.setSelection(sel).scrollIntoView())
  }
  return true
}

/** Enter on a selected reference opens its note; Mod-Alt-F inserts a footnote. */
export function footnotesKeymap(schema: Schema): KeyBindings {
  return {
    Enter: (state, dispatch, view) =>
      state.selection instanceof NodeSelection &&
      state.selection.node.type.name === 'footnote_ref' &&
      goToFootnote(state, dispatch, view),
    'Mod-Alt-f': insertFootnote(schema),
  }
}

/** Insert ▸ Footnote. */
export function footnoteToolbarItem(schema: Schema): ToolbarButton {
  return {
    type: 'button',
    id: 'footnote',
    icon: 'footnote',
    label: (t) => t('footnote.insert'),
    shortcut: 'Mod-Alt-f',
    command: insertFootnote(schema),
  }
}

/** Go to the note / back to the text (for menus and the context menu). */
export function footnoteGoToItem(): ToolbarButton {
  return {
    type: 'button',
    id: 'footnote-go',
    icon: 'footnote',
    label: (t) => t('footnote.goTo'),
    command: goToFootnote,
  }
}

/** Slash menu entry ("/nota"). */
export function footnoteSlashItem(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'footnote'
  command: Command
} {
  return {
    id: 'footnote',
    label: (t) => t('footnote.insert'),
    keywords: ['nota', 'footnote', 'piè di pagina', 'riferimento', 'citazione'],
    icon: 'footnote',
    command: insertFootnote(schema),
  }
}
