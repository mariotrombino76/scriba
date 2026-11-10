import { NodeSelection, sanitizeUrl, type Node } from '@scriba-editor/core'
import type { MessageKey, Translate } from '@scriba-editor/i18n'
import { createIcon, openDialog, type DialogHandle } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { MAX_WIDTH, MIN_WIDTH, type ImageAlign } from './nodes.js'
import {
  DEFAULT_ACCEPT,
  DEFAULT_MAX_SIZE,
  announce,
  formatSize,
  validateImageFile,
  type ImageUploadOptions,
  type UploadResult,
} from './upload.js'

let ids = 0

/** The image selected as a node, if any. */
export function selectedImage(view: EditorView): { pos: number; node: Node } | null {
  const sel = view.state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'image'
    ? { pos: sel.from, node: sel.node }
    : null
}

/**
 * Accessible image dialog (insert, or edit the selected image):
 * a file picker (button + drop zone) when an upload callback is configured,
 * or an address; alternative text (or "decorative"), width, alignment.
 * Native modal <dialog>: focus trap, Escape, focus back to the editor.
 */
export function openImageDialog(
  view: EditorView,
  t: Translate,
  options: ImageUploadOptions = {},
): DialogHandle {
  const doc = view.document
  const editing = selectedImage(view)
  const at = view.state.selection.from
  let chosen: File | null = null

  return openDialog(doc, {
    title: t(editing ? 'image.editTitle' : 'image.insertTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const id = `scriba-image-${++ids}`
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      const field = (labelKey: MessageKey, input: HTMLElement, hint?: string): HTMLElement => {
        const label = el('label')
        label.append(t(labelKey), input)
        if (!hint) return label
        // The hint is a description, outside the label (it must not become part of the name).
        const wrap = el('div', 'scriba-field-group')
        const small = el('span', 'scriba-dialog-hint')
        small.id = `${id}-${labelKey.replace(/\W/g, '-')}-hint`
        small.textContent = hint
        input.setAttribute('aria-describedby', small.id)
        wrap.append(label, small)
        return wrap
      }

      // --- File picker (only with an upload callback) ---
      const fileInput = el('input')
      fileInput.type = 'file'
      fileInput.accept = (options.accept ?? DEFAULT_ACCEPT).join(',')
      fileInput.className = 'scriba-visually-hidden'
      fileInput.tabIndex = -1
      fileInput.setAttribute('aria-hidden', 'true')
      const fileName = el('span', 'scriba-file-name')
      fileName.id = `${id}-file`
      fileName.textContent = t('image.noFile')
      const choose = el('button')
      choose.type = 'button'
      choose.className = 'scriba-file-button'
      choose.append(createIcon(doc, 'image'), t('image.choose'))
      choose.setAttribute('aria-describedby', fileName.id)
      choose.addEventListener('click', () => fileInput.click())
      const pick = (file: File | null) => {
        if (!file) return
        const error = validateImageFile(file, options)
        if (error) {
          showError(t(error, { max: formatSize(options.maxSize ?? DEFAULT_MAX_SIZE) }))
          chosen = null
          fileName.textContent = t('image.noFile')
          return
        }
        chosen = file
        fileName.textContent = `${file.name} · ${formatSize(file.size)}`
        showError('')
      }
      fileInput.addEventListener('change', () => pick(fileInput.files?.[0] ?? null))
      const zone = el('div', 'scriba-dropzone')
      const zoneText = el('span')
      zoneText.textContent = t('image.drop')
      zone.append(zoneText, choose, fileName, fileInput)
      zone.addEventListener('dragover', (e) => {
        e.preventDefault()
        zone.classList.add('scriba-dropzone-over')
      })
      zone.addEventListener('dragleave', () => zone.classList.remove('scriba-dropzone-over'))
      zone.addEventListener('drop', (e) => {
        e.preventDefault()
        zone.classList.remove('scriba-dropzone-over')
        pick(e.dataTransfer?.files?.[0] ?? null)
      })

      // --- Address ---
      const url = el('input')
      url.type = 'text'
      url.setAttribute('autocomplete', 'url')
      url.spellcheck = false
      url.value = editing ? (editing.node.attrs['src'] as string) : ''

      // --- Alternative text / decorative ---
      const alt = el('input')
      alt.type = 'text'
      alt.value = editing ? ((editing.node.attrs['alt'] as string | null) ?? '') : ''
      const decorative = el('input')
      decorative.type = 'checkbox'
      decorative.checked = !!editing && editing.node.attrs['alt'] === ''
      alt.disabled = decorative.checked
      decorative.addEventListener('change', () => {
        alt.disabled = decorative.checked
        if (decorative.checked) alt.value = ''
      })
      const decoLabel = el('label', 'scriba-check')
      decoLabel.append(decorative, t('image.decorative'))

      // --- Width ---
      const width = el('input')
      width.type = 'number'
      width.min = String(MIN_WIDTH)
      width.max = String(MAX_WIDTH)
      width.step = '1'
      width.inputMode = 'numeric'
      const current = editing?.node.attrs['width'] as number | null | undefined
      if (current) width.value = String(current)

      // --- Alignment ---
      const fieldset = el('fieldset', 'scriba-radio-group')
      const legend = el('legend')
      legend.textContent = t('image.align')
      fieldset.append(legend)
      const currentAlign = (editing?.node.attrs['align'] as ImageAlign | null | undefined) ?? null
      const radios: [HTMLInputElement, ImageAlign | null][] = []
      for (const [value, key] of [
        [null, 'image.align.none'],
        ['left', 'image.align.left'],
        ['center', 'image.align.center'],
        ['right', 'image.align.right'],
      ] as const) {
        const radio = el('input')
        radio.type = 'radio'
        radio.name = `${id}-align`
        radio.checked = value === currentAlign
        const label = el('label', 'scriba-check')
        label.append(radio, t(key))
        fieldset.append(label)
        radios.push([radio, value])
      }

      // --- Errors and actions ---
      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('aria-live', 'polite')
      const showError = (message: string) => (error.textContent = message)
      const actions = el('div', 'scriba-dialog-actions')
      const cancel = el('button')
      cancel.type = 'button'
      cancel.textContent = t('image.cancel')
      cancel.addEventListener('click', () => handle.close())
      const submit = el('button')
      submit.type = 'submit'
      submit.textContent = t(editing ? 'image.save' : 'image.insert')
      actions.append(cancel, submit)

      if (options.upload) {
        // A group, not a <label>: a button inside a label would take the whole label as its name.
        const group = el('div', 'scriba-field-group')
        group.setAttribute('role', 'group')
        const title = el('span', 'scriba-field-title')
        title.id = `${id}-file-title`
        title.textContent = t('image.file')
        group.setAttribute('aria-labelledby', title.id)
        group.append(title, zone)
        form.append(group)
      }
      form.append(
        field('image.url', url),
        field('image.alt', alt, t('image.altHelp')),
        decoLabel,
        field('image.width', width),
        fieldset,
        error,
        actions,
      )

      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const altText = decorative.checked ? '' : alt.value.trim()
        if (!decorative.checked && !altText) {
          alt.setAttribute('aria-invalid', 'true')
          showError(t('image.error.alt'))
          alt.focus()
          return
        }
        alt.removeAttribute('aria-invalid')
        const w = width.value ? Math.round(Number(width.value)) : null
        const attrs = {
          alt: altText,
          width: w && w >= MIN_WIDTH && w <= MAX_WIDTH ? w : null,
          align: radios.find(([r]) => r.checked)?.[1] ?? null,
        }
        let src: string | null = null
        if (chosen && options.upload) {
          submit.disabled = true
          showError('')
          announce(view, t('image.uploading'))
          try {
            const result: UploadResult = await options.upload(chosen)
            src = sanitizeUrl(typeof result === 'string' ? result : result.src, { kind: 'image' })
          } catch {
            src = null
          }
          submit.disabled = false
          if (!src) {
            showError(t('image.error.upload'))
            return
          }
        } else if (url.value.trim()) {
          src = sanitizeUrl(url.value.trim(), { kind: 'image' })
          if (!src) {
            url.setAttribute('aria-invalid', 'true')
            showError(t('image.error.url'))
            url.focus()
            return
          }
        } else if (editing) {
          src = editing.node.attrs['src'] as string
        } else {
          showError(t('image.error.missing'))
          return
        }
        const type = view.state.schema.nodes['image']!
        const tr = view.state.tr
        const target = selectedImage(view)
        if (target) {
          tr.setNodeAttrs(target.pos, { ...attrs, src })
          tr.setSelection(NodeSelection.create(tr.doc, target.pos))
        } else {
          const pos = Math.min(at, tr.doc.content.size)
          tr.insert(pos, type.create({ ...attrs, src }))
          tr.setSelection(NodeSelection.create(tr.doc, pos))
        }
        view.dispatch(tr.scrollIntoView())
        announce(view, t('image.uploaded'))
        handle.close()
      })
      queueMicrotask(() => (options.upload && !editing ? choose : url).focus())
    },
  })
}
