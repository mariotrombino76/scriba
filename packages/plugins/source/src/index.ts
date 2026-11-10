import {
  HTMLLimitError,
  HTMLSerializer,
  Selection,
  parseHTML,
  type HTMLParseOptions,
  type Node,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog, type DialogHandle, type ToolbarButton } from '@scriba-editor/ui'
import { parseInertHTML, type EditorView } from '@scriba-editor/view'

export interface SourceOptions {
  /** Longest HTML accepted on save (characters, default 2 000 000; §5.10). */
  maxLength?: number
  /** Parser limits (nesting depth, number of nodes). */
  parse?: HTMLParseOptions
}

export const DEFAULT_MAX_SOURCE_LENGTH = 2_000_000

/** The document as HTML from the serializer, one top-level block per line (easier to read and edit). */
export function documentSource(doc: Node): string {
  const serializer = new HTMLSerializer(doc.type.schema)
  const lines: string[] = []
  doc.forEach((block) => lines.push(serializer.serializeNode(block)))
  return lines.join('\n')
}

/**
 * Parses edited HTML exactly like any untrusted input (§5.2): an inert
 * document (`DOMParser`, Trusted Types policy), then the schema parser, which
 * drops everything the schema does not know. Throws `HTMLLimitError` past the limits.
 */
export function parseSource(view: EditorView, html: string, options: SourceOptions = {}): Node {
  const max = options.maxLength ?? DEFAULT_MAX_SOURCE_LENGTH
  if (html.length > max) throw new HTMLLimitError(`Source longer than ${max} characters`)
  return parseHTML(view.state.schema, parseInertHTML(html).body, options.parse)
}

let ids = 0

/** "Source code" dialog: edit the HTML, save it back into the document (one undo step). */
export function openSourceDialog(
  view: EditorView,
  t: Translate,
  options: SourceOptions = {},
): DialogHandle {
  const doc = view.document
  return openDialog(doc, {
    title: t('source.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      handle.dialog.classList.add('scriba-source-dialog')
      const id = `scriba-source-${++ids}`
      const label = doc.createElement('label')
      label.htmlFor = id
      label.textContent = t('source.label')
      const area = doc.createElement('textarea')
      area.id = id
      area.className = 'scriba-source'
      area.spellcheck = false
      area.wrap = 'soft'
      area.value = documentSource(view.state.doc)
      area.readOnly = !view.editable
      const hint = doc.createElement('p')
      hint.className = 'scriba-dialog-hint'
      hint.id = `${id}-hint`
      hint.textContent = t('source.hint')
      area.setAttribute('aria-describedby', hint.id)
      const error = doc.createElement('p')
      error.className = 'scriba-dialog-error'
      error.setAttribute('aria-live', 'polite')
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const cancel = doc.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('source.cancel')
      cancel.addEventListener('click', () => handle.close())
      const save = doc.createElement('button')
      save.type = 'submit'
      save.textContent = t('source.save')
      save.disabled = !view.editable
      actions.append(cancel, save)
      form.append(label, area, hint, error, actions)

      form.addEventListener('submit', (event) => {
        event.preventDefault()
        if (!view.editable) return
        let parsed: Node
        try {
          parsed = parseSource(view, area.value, options)
        } catch (e) {
          if (!(e instanceof HTMLLimitError)) throw e
          area.setAttribute('aria-invalid', 'true')
          error.textContent = t('source.error.limit')
          area.focus()
          return
        }
        handle.close()
        const state = view.state
        if (parsed.eq(state.doc)) return
        const tr = state.tr.replaceWith(0, state.doc.content.size, parsed.content)
        tr.setSelection(Selection.atStart(tr.doc))
        view.dispatch(tr.scrollIntoView())
      })
      queueMicrotask(() => {
        area.focus()
        area.setSelectionRange(0, 0)
      })
    },
  })
}

/** Toolbar button opening the source dialog. */
export function sourceToolbarItem(t: Translate, options: SourceOptions = {}): ToolbarButton {
  return {
    type: 'button',
    id: 'source',
    icon: 'source',
    label: (tr) => tr('source.button'),
    command: () => true,
    run: (view) => openSourceDialog(view, t, options),
    readOnly: true, // shows the HTML; saving is disabled in read-only
  }
}
