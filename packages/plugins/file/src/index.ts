import {
  CLOSE_HISTORY,
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type EditorState,
  type KeyBindings,
  type Node,
} from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import { openDialog, type ToolbarMenu } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'
import { OPEN_ACCEPT, OpenFileError, formatOf, readDocument, type OpenLimits } from './read.js'
import { openPreview, printDocument } from './preview.js'
import { documentBlob, documentTitle, download, fileName, type SaveFormat } from './write.js'

export {
  readDocument,
  formatOf,
  OpenFileError,
  OPEN_ACCEPT,
  type OpenFormat,
  type OpenLimits,
} from './read.js'
export {
  documentBlob,
  documentTitle,
  documentToHTMLFile,
  documentToText,
  download,
  fileName,
  type SaveFormat,
} from './write.js'
export { documentToDocx } from './docx-write.js'
export { openPreview, printDocument, renderDocument } from './preview.js'

export interface FileOptions extends OpenLimits {
  t: Translate
  /** Title (and file name) when the document has none (default: translated "Documento"). */
  defaultTitle?: string
  /** Format of Ctrl/Cmd+S (default `'html'`). */
  saveFormat?: SaveFormat
  /** Language written in saved HTML pages (default `'it'`). */
  lang?: string
}

/** The document as last opened, created or saved: anything else is unsaved. */
const fileKey = new PluginKey<Node>('file')
const SAVED = 'scribaFileSaved'

/** Whether there are changes since the document was opened, created or saved. */
export function hasUnsavedChanges(state: EditorState): boolean {
  const saved = fileKey.getState(state)
  return !!saved && !saved.eq(state.doc)
}

/** Replaces the whole document (one undoable step) and marks it saved. */
function replaceDocument(view: EditorView, doc: Node): void {
  const { state } = view
  const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
  tr.setSelection(TextSelection.near(tr.doc.resolve(1))).setMeta(CLOSE_HISTORY, true)
  view.dispatch(tr.setMeta(SAVED, true).scrollIntoView())
  view.focus()
}

/** Asks before losing unsaved changes; `go` runs at once when there are none. */
function confirmDiscard(view: EditorView, t: Translate, go: () => void): void {
  if (!hasUnsavedChanges(view.state)) return go()
  openDialog(view.document, {
    title: t('file.unsavedTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const text = doc.createElement('p')
      text.textContent = t('file.unsaved')
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const cancel = doc.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('file.cancel')
      cancel.addEventListener('click', () => handle.close())
      const ok = doc.createElement('button')
      ok.type = 'submit'
      ok.textContent = t('file.discard')
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        handle.close()
        go()
      })
      actions.append(cancel, ok)
      form.append(text, actions)
      cancel.focus() // the safe choice first
    },
  })
}

/** Status message for screen readers (and an alert for errors). */
function announce(view: EditorView, text: string, error = false): void {
  const doc = view.document
  let live = doc.querySelector<HTMLElement>('.scriba-file-status')
  if (!live) {
    live = doc.createElement('div')
    live.className = 'scriba-file-status scriba-visually-hidden'
    doc.body.appendChild(live)
  }
  live.setAttribute('role', error ? 'alert' : 'status')
  live.textContent = text
}

/** Opens a file (after confirming unsaved changes): untrusted input, through the schema. */
export function openFile(view: EditorView, file: File, options: FileOptions): void {
  const { t } = options
  confirmDiscard(view, t, () => {
    announce(view, t('file.opening', { name: file.name }))
    readDocument(view.state.schema, file, options).then(
      (doc) => {
        if (!view.editable) return
        replaceDocument(view, doc)
        announce(view, t('file.opened', { name: file.name }))
      },
      (e: unknown) => {
        const reason = e instanceof OpenFileError ? e.reason : 'damaged'
        announce(view, t(`file.error.${reason}` as MessageKey, { name: file.name }), true)
      },
    )
  })
}

/** Shows the file picker and opens the chosen file. */
export function chooseFile(view: EditorView, options: FileOptions): void {
  const input = view.document.createElement('input')
  input.type = 'file'
  input.accept = OPEN_ACCEPT
  input.hidden = true
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (file) openFile(view, file, options)
  })
  view.document.body.appendChild(input)
  input.click()
}

/** Empties the document (after confirming unsaved changes). */
export function newDocument(view: EditorView, options: FileOptions): void {
  confirmDiscard(view, options.t, () => {
    const empty = view.state.schema.topNodeType.createAndFill()!
    replaceDocument(view, empty)
    announce(view, options.t('file.created'))
  })
}

/** Downloads the document in `format`; the document then counts as saved. */
export async function saveDocument(
  view: EditorView,
  format: SaveFormat,
  options: FileOptions,
): Promise<void> {
  const { t } = options
  const doc = view.state.doc
  const title = documentTitle(doc, options.defaultTitle ?? t('file.untitled'))
  try {
    const blob = await documentBlob(doc, format, title, options.lang ?? 'it')
    const name = fileName(title, format)
    download(view.document, blob, name)
    if (view.state.doc === doc) view.dispatch(view.state.tr.setMeta(SAVED, true))
    announce(view, t('file.saved', { name }))
  } catch {
    announce(view, t('file.error.save'), true)
  }
}

/**
 * The file plugin: tracks unsaved changes and opens documents dropped on the
 * editor (.docx, .html, .md, .txt; images are left to the image plugin).
 */
export function filePlugin(options: FileOptions): Plugin<Node> {
  const props: ViewPluginProps = {
    handleDrop(view, event) {
      const file = [...(event.dataTransfer?.files ?? [])].find((f) => formatOf(f.name))
      if (!file || !view.editable) return false
      openFile(view, file, options)
      return true
    },
  }
  return new Plugin<Node>({
    key: fileKey,
    state: {
      init: (_config, state) => state.doc,
      apply: (tr, saved, _old, state) => (tr.getMeta(SAVED) ? state.doc : saved),
    },
    props: { ...props },
  })
}

/**
 * Ctrl/Cmd+O open, Ctrl/Cmd+S download (in `saveFormat`), Ctrl/Cmd+P print.
 * Register with `readOnly: true`: saving and printing work in read-only too.
 */
export function fileKeymap(options: FileOptions): KeyBindings {
  const withView =
    (run: (view: EditorView) => void, editing = false): Command =>
    (_state, dispatch, view) => {
      if (!view || (editing && !(view as EditorView).editable)) return false
      if (dispatch) run(view as EditorView)
      return true
    }
  return {
    'Mod-o': withView((v) => chooseFile(v, options), true),
    'Mod-s': withView((v) => void saveDocument(v, options.saveFormat ?? 'html', options)),
    'Mod-p': withView((v) => printDocument(v)),
  }
}

/** The "File" menu: new, open, download as…, preview, print. */
export function fileMenu(options: FileOptions): ToolbarMenu {
  const always: Command = () => true
  const save = (format: SaveFormat, key: MessageKey) => ({
    id: `save-${format}`,
    label: (t: Translate) => t(key),
    command: always,
    readOnly: true,
    run: (view: EditorView) => void saveDocument(view, format, options),
  })
  return {
    type: 'menu',
    id: 'file',
    icon: 'file',
    label: (t) => t('file.menu'),
    entries: [
      {
        id: 'new',
        label: (t) => t('file.new'),
        command: always,
        run: (v) => newDocument(v, options),
      },
      {
        id: 'open',
        label: (t) => t('file.open'),
        shortcut: 'Mod-o',
        command: always,
        run: (v) => chooseFile(v, options),
      },
      save('html', 'file.saveHTML'),
      save('docx', 'file.saveDocx'),
      save('markdown', 'file.saveMarkdown'),
      save('text', 'file.saveText'),
      {
        id: 'preview',
        label: (t) => t('file.preview'),
        command: always,
        readOnly: true,
        run: (v) => openPreview(v, options.t),
      },
      {
        id: 'print',
        label: (t) => t('file.print'),
        shortcut: 'Mod-p',
        command: always,
        readOnly: true,
        run: (v) => printDocument(v),
      },
    ],
  }
}
