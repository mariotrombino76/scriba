let dialogCount = 0

export interface DialogHandle {
  dialog: HTMLDialogElement
  form: HTMLFormElement
  /** Closes the dialog and gives focus back (to `returnFocus` or the previously focused element). */
  close(): void
}

/**
 * Creates a modal dialog (native `<dialog>` + `showModal()`): the rest of the
 * page becomes inert, so focus cannot leave it (focus trap); Escape closes it;
 * on close, focus returns where it was (CLAUDE.md §6). DOM is built with
 * `createElement` only.
 */
export function openDialog(
  doc: Document,
  options: {
    title: string
    build: (form: HTMLFormElement, handle: DialogHandle) => void
    returnFocus?: () => void
  },
): DialogHandle {
  const previous = doc.activeElement as HTMLElement | null
  const dialog = doc.createElement('dialog')
  dialog.className = 'scriba-dialog'
  const titleId = `scriba-dialog-title-${++dialogCount}`
  dialog.setAttribute('aria-labelledby', titleId)
  const title = doc.createElement('h2')
  title.id = titleId
  title.className = 'scriba-dialog-title'
  title.textContent = options.title
  const form = doc.createElement('form')
  form.method = 'dialog'
  form.noValidate = true
  dialog.append(title, form)

  let closed = false
  const handle: DialogHandle = {
    dialog,
    form,
    close() {
      if (closed) return
      closed = true
      if (dialog.open) dialog.close()
      dialog.remove()
      if (options.returnFocus) options.returnFocus()
      else previous?.focus()
    },
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault()
    handle.close()
  })
  options.build(form, handle)
  doc.body.appendChild(dialog)
  dialog.showModal()
  return handle
}
