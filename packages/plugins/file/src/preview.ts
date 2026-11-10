import { serializeHTML, type Node } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import { openDialog } from '@scriba-editor/ui'
import { parseInertHTML, type EditorView } from '@scriba-editor/view'

/**
 * The document as page content: HTML from the serializer, read in an inert
 * document and imported node by node (never innerHTML; CLAUDE.md §5.2).
 */
export function renderDocument(doc: Document, content: Node, className: string): HTMLElement {
  const box = doc.createElement('div')
  box.className = className
  for (const child of [...parseInertHTML(serializeHTML(content)).body.childNodes])
    box.appendChild(doc.importNode(child, true))
  return box
}

/** Shows the document as it will look, read-only, in a dialog. */
export function openPreview(view: EditorView, t: Translate): void {
  openDialog(view.document, {
    title: t('file.preview'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const page = renderDocument(view.document, view.state.doc, 'scriba-preview')
      page.tabIndex = 0 // scrollable with the keyboard
      page.setAttribute('role', 'document')
      page.setAttribute('aria-label', t('file.preview'))
      const actions = view.document.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const print = view.document.createElement('button')
      print.type = 'button'
      print.textContent = t('file.print')
      print.addEventListener('click', () => {
        handle.close()
        printDocument(view)
      })
      const close = view.document.createElement('button')
      close.type = 'submit'
      close.textContent = t('file.close')
      close.addEventListener('click', (e) => {
        e.preventDefault()
        handle.close()
      })
      actions.append(print, close)
      form.append(page, actions)
      handle.dialog.classList.add('scriba-preview-dialog')
    },
  })
}

/**
 * Prints only the document (the browser's print dialog also saves as PDF):
 * a print copy is added to the page, everything else is hidden while printing.
 */
export function printDocument(view: EditorView): void {
  const doc = view.document
  const win = doc.defaultView
  if (!win) return
  const copy = renderDocument(doc, view.state.doc, 'scriba-print')
  doc.body.appendChild(copy)
  doc.documentElement.classList.add('scriba-printing')
  const done = () => {
    win.removeEventListener('afterprint', done)
    doc.documentElement.classList.remove('scriba-printing')
    copy.remove()
  }
  win.addEventListener('afterprint', done)
  win.print()
  // some browsers return from print() without afterprint (e.g. when blocked)
  setTimeout(() => {
    if (copy.isConnected && !win.matchMedia?.('print').matches) done()
  }, 1000)
}
