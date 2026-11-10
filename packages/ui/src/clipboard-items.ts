import type { Translate } from '@scriba-editor/i18n'
import type { ClipboardContent, EditorView } from '@scriba-editor/view'
import { openDialog } from './dialog.js'
import type { ToolbarButton } from './items.js'
import { formatShortcut, isMac } from './shortcut.js'

/**
 * Cut and copy from a menu: the browser's own copy event first (inside the
 * click, no permission needed; the editor fills it from the serializer), then
 * the asynchronous Clipboard API.
 */
async function copy(view: EditorView, cut: boolean): Promise<boolean> {
  const data = view.clipboardContent()
  if (!data) return false
  view.focus()
  if (view.document.execCommand(cut ? 'cut' : 'copy')) return true
  const win = view.document.defaultView
  const clipboard = win?.navigator.clipboard
  try {
    if (clipboard?.write && win?.ClipboardItem) {
      await clipboard.write([
        new win.ClipboardItem({
          'text/html': new Blob([data.html], { type: 'text/html' }),
          'text/plain': new Blob([data.text], { type: 'text/plain' }),
        }),
      ])
    } else if (clipboard?.writeText) {
      await clipboard.writeText(data.text)
    } else return false
  } catch {
    return false
  }
  if (cut && view.editable) view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
  return true
}

/** Reads the clipboard (the browser may ask the user first); null when it is not allowed. */
async function readClipboard(view: EditorView): Promise<ClipboardContent | null> {
  const clipboard = view.document.defaultView?.navigator.clipboard
  try {
    if (clipboard?.read) {
      const data: { html?: string; text?: string; files: File[] } = { files: [] }
      for (const item of await clipboard.read()) {
        for (const type of item.types) {
          const blob = await item.getType(type)
          if (type === 'text/html') data.html ??= await blob.text()
          else if (type === 'text/plain') data.text ??= await blob.text()
          else if (type.startsWith('image/'))
            data.files.push(new File([blob], `image.${type.slice(6)}`, { type }))
        }
      }
      return data
    }
    if (clipboard?.readText) return { text: await clipboard.readText() }
  } catch {
    // not allowed (permission refused, insecure page…)
  }
  return null
}

/** The browser refused: say so, like TinyMCE, with the keys that always work. */
function blocked(view: EditorView, t: Translate, binding: string, mac: boolean): void {
  openDialog(view.document, {
    title: t('edit.clipboardTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const message = view.document.createElement('p')
      message.textContent = t('edit.clipboardBlocked', { keys: formatShortcut(binding, t, mac) })
      const actions = view.document.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const ok = view.document.createElement('button')
      ok.type = 'submit'
      ok.textContent = t('edit.ok')
      actions.appendChild(ok)
      form.append(message, actions)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        handle.close()
      })
    },
  })
}

/**
 * Cut, copy, paste and paste as text for the Edit menu (like TinyMCE's). Copy works
 * read-only too. Paste reads the clipboard through the browser (which may ask
 * for permission) and inserts it exactly like a paste event: untrusted, through
 * the schema parser. When the browser refuses, a message suggests the keys.
 */
export function clipboardItems(t: Translate, options: { mac?: boolean } = {}): ToolbarButton[] {
  const mac = options.mac ?? isMac()
  const paste = (
    id: string,
    label: 'edit.paste' | 'edit.pasteText',
    shortcut: string,
    pick: (data: ClipboardContent) => ClipboardContent,
  ): ToolbarButton => ({
    type: 'button',
    id,
    label: (tr) => tr(label),
    shortcut,
    command: () => true,
    run: (view) => {
      view.focus()
      void readClipboard(view).then((data) => {
        if (!data) blocked(view, t, shortcut, mac)
        else view.paste(pick(data))
      })
    },
  })
  return [
    {
      type: 'button',
      id: 'cut',
      label: (tr) => tr('edit.cut'),
      shortcut: 'Mod-x',
      command: (state) => !state.selection.empty,
      run: (view) => void copy(view, true).then((ok) => ok || blocked(view, t, 'Mod-x', mac)),
    },
    {
      type: 'button',
      id: 'copy',
      label: (tr) => tr('edit.copy'),
      shortcut: 'Mod-c',
      command: (state) => !state.selection.empty,
      readOnly: true,
      run: (view) => void copy(view, false).then((ok) => ok || blocked(view, t, 'Mod-c', mac)),
    },
    paste('paste', 'edit.paste', 'Mod-v', (data) => data),
    // formatting dropped: the plain text only
    paste('paste-text', 'edit.pasteText', 'Mod-Shift-v', (data) => ({ text: data.text ?? '' })),
  ]
}
