import {
  AllSelection,
  Fragment,
  HTMLSerializer,
  Selection,
  TextSelection,
  insertContent,
  parseHTML,
  type Node,
} from '@scriba-editor/core'
import { someProp } from './plugin-hooks.js'
import { parseInertHTML } from './trusted-types.js'
import type { EditorView } from './view.js'

/** Clipboard data: HTML and/or plain text, files (images…). */
export interface ClipboardContent {
  html?: string
  text?: string
  files?: readonly File[]
}

/**
 * What the selection holds, as clipboard data: HTML from the model's
 * serializer (never from the DOM) plus plain text; null for an empty selection.
 */
export function selectionClipboard(view: EditorView): { html: string; text: string } | null {
  const sel = view.state.selection
  if (sel.empty) return null
  // the selection decides what it holds (a cell selection: just its cells, as a table)
  const slice = sel.content()
  const html = new HTMLSerializer(view.state.schema).serializeFragment(slice.content)
  const text = slice.content.textBetween(0, slice.content.size, '\n\n', '\n')
  return { html, text }
}

/** Copy/cut: see `selectionClipboard`. */
export function handleCopy(view: EditorView, event: ClipboardEvent, cut: boolean): void {
  // selectionchange is async: make sure the model has the selection the user sees
  view.syncSelectionFromDOM()
  const data = selectionClipboard(view)
  if (!data || !event.clipboardData) return
  event.preventDefault()
  event.clipboardData.setData('text/html', data.html)
  event.clipboardData.setData('text/plain', data.text)
  if (!cut || !view.editable) return
  if (someProp(view.state, 'handleDeleteSelection', (handle) => handle(view))) return
  view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
}

/** Upper bound on pasted HTML/text length (CLAUDE.md §5.10). */
const MAX_PASTE_LENGTH = 5_000_000

/**
 * Plugin prop to clean pasted HTML before it is parsed:
 * `props: { transformPastedDOM(body, view) { … } }`. It receives the body of
 * the INERT document (scripts never run there) and may rewrite it; the result
 * still goes through the schema parser.
 */
export type TransformPastedDOM = (body: HTMLElement, view: EditorView) => void

/**
 * Paste: HTML is parsed in an inert document (`DOMParser`), cleaned by the
 * plugins' `transformPastedDOM` and passed through the schema parser, exactly
 * like any other untrusted input (§5.2). Then it is fitted to the place it
 * goes (`insertContent`). Ctrl/Cmd+Shift+V pastes plain text.
 */
export function handlePaste(view: EditorView, event: ClipboardEvent): void {
  event.preventDefault()
  if (!view.editable || !event.clipboardData) return
  // selectionchange is async: paste where the caret is now, not where it was a moment ago
  view.syncSelectionFromDOM()
  const plainOnly = view.consumePlainPaste()
  pasteContent(view, {
    html: plainOnly ? '' : event.clipboardData.getData('text/html'),
    text: event.clipboardData.getData('text/plain'),
    files: [...(event.clipboardData.files ?? [])],
  })
}

/**
 * Pastes clipboard data at the selection, through the same path as a paste
 * event: files to the plugins, HTML through the inert document, the plugins'
 * cleaning and the schema parser, else plain text. The data is untrusted.
 * Returns whether something was inserted.
 */
export function pasteContent(view: EditorView, data: ClipboardContent): boolean {
  if (!view.editable) return false
  const files = [...(data.files ?? [])]
  if (files.length && someProp(view.state, 'handlePasteFiles', (handle) => handle(view, files)))
    return true
  const html = data.html ?? ''
  const text = data.text ?? ''
  if (html.length > MAX_PASTE_LENGTH || text.length > MAX_PASTE_LENGTH) return false
  let doc: Node | null = null
  if (html) {
    try {
      const body = parseInertHTML(html).body
      for (const plugin of view.state.plugins) {
        const transform = plugin.props['transformPastedDOM'] as TransformPastedDOM | undefined
        if (typeof transform === 'function') transform(body, view)
      }
      doc = parseHTML(view.state.schema, body)
    } catch {
      doc = null // limits exceeded or unparsable: fall back to plain text
    }
  }
  if (
    doc &&
    hasContent(doc) &&
    (someProp(view.state, 'handlePasteContent', (handle) => handle(view, doc.content)) ||
      insertFragment(view, doc.content))
  )
    return true
  if (!text) return false
  insertPlainText(view, text)
  return true
}

/** A parsed paste that produced only an empty paragraph has nothing to insert. */
function hasContent(doc: Node): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.isText || node.isLeaf) found = true
    return !found
  })
  return found || doc.childCount > 1
}

/** Inserts content where the selection is, fitting it to the place (see `insertContent`). */
function insertFragment(view: EditorView, content: Fragment): boolean {
  const tr = view.state.tr
  const sel = view.state.selection
  if (sel instanceof AllSelection) {
    tr.replaceWith(0, tr.doc.content.size, content)
    tr.setSelection(Selection.atEnd(tr.doc))
    view.dispatch(tr.scrollIntoView())
    return true
  }
  let { from, to } = sel
  if (!(sel instanceof TextSelection) && !sel.empty) {
    // node and cell selections delete themselves first (a cell selection keeps its table)
    tr.deleteSelection()
    from = to = tr.selection.from
  }
  const end = insertContent(tr, from, to, content)
  if (end === null) return false
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1))
  view.dispatch(tr.scrollIntoView())
  return true
}

/** Plain text: one paragraph per line (a single line or code: inserted as typed text). */
function insertPlainText(view: EditorView, text: string): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const schema = view.state.schema
  const para = schema.nodes['paragraph']
  if (lines.length === 1 || !para || view.state.selection.$from.parent.type.spec.code) {
    view.dispatch(typeText(view, para ? text : lines.join(' ')))
    return
  }
  const blocks = lines.map((line) => para.create(null, line ? schema.text(line) : null))
  if (!insertFragment(view, Fragment.fromArray(blocks))) {
    view.dispatch(typeText(view, lines.join(' ')))
  }
}

/** Text typed over the selection (node and cell selections delete themselves first). */
function typeText(view: EditorView, text: string) {
  const tr = view.state.tr
  if (!(tr.selection instanceof TextSelection) && !tr.selection.empty) tr.deleteSelection()
  return tr.insertText(text).scrollIntoView()
}
