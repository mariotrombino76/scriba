import { Fragment, HTMLSerializer, Slice, parseHTML, type Node } from '@scriba/core'
import { parseInertHTML } from './trusted-types.js'
import type { EditorView } from './view.js'

/** Copy/cut: HTML from the model's serializer (never from the DOM) plus plain text. */
export function handleCopy(view: EditorView, event: ClipboardEvent, cut: boolean): void {
  const sel = view.state.selection
  if (sel.empty || !event.clipboardData) return
  event.preventDefault()
  const slice = sel.content()
  const html = new HTMLSerializer(view.state.schema).serializeFragment(slice.content)
  const text = view.state.doc.textBetween(sel.from, sel.to, '\n\n', '\n')
  event.clipboardData.setData('text/html', html)
  event.clipboardData.setData('text/plain', text)
  if (cut && view.editable) view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
}

/** Upper bound on pasted HTML/text length (CLAUDE.md §5.10). */
const MAX_PASTE_LENGTH = 5_000_000

/**
 * Paste: HTML is parsed in an inert document (`DOMParser`) and passed through
 * the schema parser, exactly like any other untrusted input (§5.2).
 */
export function handlePaste(view: EditorView, event: ClipboardEvent): void {
  event.preventDefault()
  if (!view.editable || !event.clipboardData) return
  const html = event.clipboardData.getData('text/html')
  const text = event.clipboardData.getData('text/plain')
  if (html.length > MAX_PASTE_LENGTH || text.length > MAX_PASTE_LENGTH) return
  let doc: Node | null = null
  if (html) {
    try {
      doc = parseHTML(view.state.schema, parseInertHTML(html).body)
    } catch {
      doc = null // limits exceeded or unparsable: fall back to plain text
    }
  }
  if (doc && insertDoc(view, doc)) return
  if (text) insertPlainText(view, text)
}

/** Inserts parsed content: inline content of a single textblock, or the blocks as an open slice. */
function insertDoc(view: EditorView, doc: Node): boolean {
  const first = doc.firstChild
  const slice =
    doc.childCount === 1 && first?.isTextblock
      ? new Slice(first.content, 0, 0)
      : Slice.maxOpen(doc.content)
  if (!slice.size) return true
  try {
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
    return true
  } catch {
    return false // the slice does not fit here (full fitting comes with paste-clean, Phase 2)
  }
}

/** Plain text: one paragraph per line, inserted as typed text. */
function insertPlainText(view: EditorView, text: string): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const tr = view.state.tr
  const code = !!tr.selection.$from.parent.type.spec.code
  if (code || lines.length === 1) {
    tr.insertText(text)
  } else {
    const schema = view.state.schema
    const para = schema.nodes['paragraph']
    if (!para) {
      tr.insertText(lines.join(' '))
    } else {
      const blocks = lines.map((line) => para.create(null, line ? schema.text(line) : null))
      try {
        tr.replaceSelection(Slice.maxOpen(Fragment.fromArray(blocks)))
      } catch {
        tr.insertText(lines.join(' '))
      }
    }
  }
  view.dispatch(tr.scrollIntoView())
}
