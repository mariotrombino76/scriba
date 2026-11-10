import type { MessageKey, Translate } from '@scriba-editor/i18n'
import { openDialog, type DialogHandle } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { MAX_COLS, MAX_ROWS, insertTable } from './commands.js'

/**
 * Accessible "Insert table" dialog: rows, columns, header row.
 * Native modal <dialog>: focus trap, Escape, focus back to the editor.
 */
export function openTableDialog(view: EditorView, t: Translate): DialogHandle {
  const doc = view.document
  return openDialog(doc, {
    title: t('table.insertTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      const number = (
        labelKey: MessageKey,
        value: number,
        max: number,
      ): [HTMLLabelElement, HTMLInputElement] => {
        const input = el('input')
        input.type = 'number'
        input.min = '1'
        input.max = String(max)
        input.step = '1'
        input.inputMode = 'numeric'
        input.required = true
        input.value = String(value)
        const label = el('label')
        label.append(t(labelKey), input)
        return [label, input]
      }
      const [rowsLabel, rows] = number('table.rows', 3, MAX_ROWS)
      const [colsLabel, cols] = number('table.cols', 3, MAX_COLS)
      const header = el('input')
      header.type = 'checkbox'
      header.checked = true
      const headerLabel = el('label', 'scriba-check')
      headerLabel.append(header, t('table.headerRow'))

      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('aria-live', 'polite')
      const actions = el('div', 'scriba-dialog-actions')
      const cancel = el('button')
      cancel.type = 'button'
      cancel.textContent = t('table.cancel')
      cancel.addEventListener('click', () => handle.close())
      const submit = el('button')
      submit.type = 'submit'
      submit.textContent = t('table.create')
      actions.append(cancel, submit)
      form.append(rowsLabel, colsLabel, headerLabel, error, actions)

      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const r = Number(rows.value)
        const c = Number(cols.value)
        const okRows = Number.isInteger(r) && r >= 1 && r <= MAX_ROWS
        const okCols = Number.isInteger(c) && c >= 1 && c <= MAX_COLS
        for (const [input, ok] of [
          [rows, okRows],
          [cols, okCols],
        ] as const) {
          if (ok) input.removeAttribute('aria-invalid')
          else input.setAttribute('aria-invalid', 'true')
        }
        if (!okRows || !okCols) {
          error.textContent = t('table.error.size', { rows: MAX_ROWS, cols: MAX_COLS })
          ;(okRows ? cols : rows).focus()
          return
        }
        handle.close()
        insertTable(r, c, header.checked)(view.state, (tr) => view.dispatch(tr), view)
      })
      queueMicrotask(() => rows.focus())
    },
  })
}
