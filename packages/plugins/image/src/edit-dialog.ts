import { NodeSelection, sanitizeUrl, type Node } from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import { createIcon, openDialog, type DialogHandle, type IconName } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import { cropStage } from './edit-crop.js'
import {
  NO_EDITS,
  aspectCrop,
  clampCrop,
  cropRect,
  editedWidth,
  fitRatio,
  flip,
  isUnchanged,
  orientedSize,
  outputSize,
  rotate,
  type ImageEdits,
  type Rect,
  type Size,
} from './edit-geometry.js'
import {
  canvasToFile,
  fileToDataUrl,
  fitScale,
  loadEditableImage,
  outputType,
  renderEdits,
} from './edit-render.js'
import { MAX_WIDTH, MIN_WIDTH } from './nodes.js'
import {
  DEFAULT_MAX_SIZE,
  announce,
  formatSize,
  validateImageFile,
  type ImageUploadOptions,
} from './upload.js'
import { selectedImage } from './dialog.js'

/** Longest side of the preview, in pixels: large photos are reduced, small ones enlarged. */
const PREVIEW_SIDE = 560
type RatioChoice = 'free' | 'original' | '1:1' | '4:3' | '16:9'
const RATIOS: readonly [RatioChoice, MessageKey][] = [
  ['free', 'imageEdit.ratio.free'],
  ['original', 'imageEdit.ratio.original'],
  ['1:1', 'imageEdit.ratio.square'],
  ['4:3', 'imageEdit.ratio.4:3'],
  ['16:9', 'imageEdit.ratio.16:9'],
]
let ids = 0

/**
 * Photo editor for the selected image: rotate, mirror, crop (free or with a
 * ratio), brightness, contrast, saturation. Drawn with the native canvas; the
 * result is a new file, sent through your `upload` callback (without one it
 * becomes a `data:` URL, within the schema's size limit). A single undoable
 * change of `src` (and of `width`, to keep the displayed scale).
 * Returns null when no image is selected.
 */
export function openImageEditor(
  view: EditorView,
  t: Translate,
  options: ImageUploadOptions = {},
): DialogHandle | null {
  const target = selectedImage(view)
  if (!target) return null
  const doc = view.document
  const original = target.node.attrs['src'] as string
  const id = `scriba-image-edit-${++ids}`

  const handle = openDialog(doc, {
    title: t('imageEdit.title'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      handle.dialog.classList.add('scriba-image-editor')
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
        const e = doc.createElement(tag)
        if (cls) e.className = cls
        return e
      }
      const button = (labelKey: MessageKey, onClick: () => void, icon?: IconName) => {
        const b = el('button')
        b.type = 'button'
        if (icon) {
          b.className = 'scriba-image-editor-tool'
          b.append(createIcon(doc, icon))
          b.setAttribute('aria-label', t(labelKey))
          b.title = t(labelKey)
        } else b.textContent = t(labelKey)
        b.addEventListener('click', onClick)
        return b
      }

      let img: HTMLImageElement | null = null
      let source: Size = { width: 1, height: 1 }
      let edits: ImageEdits = NO_EDITS
      let ratioChoice: RatioChoice = 'free'
      const ratio = (): number | null => {
        if (ratioChoice === 'free') return null
        if (ratioChoice === 'original') {
          const o = orientedSize(source, edits.rotation)
          return o.width / o.height
        }
        const [w, h] = ratioChoice.split(':').map(Number) as [number, number]
        return w / h
      }

      const status = el('p', 'scriba-image-editor-status')
      status.setAttribute('aria-live', 'polite')
      status.textContent = t('imageEdit.loading')
      const error = el('p', 'scriba-dialog-error')
      error.setAttribute('aria-live', 'polite')
      const showError = (message: string) => (error.textContent = message)

      // everything but Cancel waits for the image: a disabled fieldset disables its controls
      const body = el('fieldset', 'scriba-image-editor-body')
      body.disabled = true

      // --- Orientation ---
      const tools = el('div', 'scriba-image-editor-tools')
      tools.setAttribute('role', 'group')
      tools.setAttribute('aria-label', t('imageEdit.tools'))
      const reorient = (next: ImageEdits) => {
        edits = next
        const r = ratio()
        if (r && edits.crop) edits = { ...edits, crop: aspectCrop(bounds(), r, edits.crop) }
        refresh(true)
      }
      tools.append(
        button('imageEdit.rotateLeft', () => reorient(rotate(edits, source, -1)), 'rotateLeft'),
        button('imageEdit.rotateRight', () => reorient(rotate(edits, source, 1)), 'rotateRight'),
        button(
          'imageEdit.flipH',
          () => reorient(flip(edits, source, 'horizontal')),
          'flipHorizontal',
        ),
        button('imageEdit.flipV', () => reorient(flip(edits, source, 'vertical')), 'flipVertical'),
      )

      // --- Crop ---
      const bounds = () => orientedSize(source, edits.rotation)
      const setCrop = (crop: Rect, done = true) => {
        edits = { ...edits, crop }
        syncFields()
        if (done) sayStatus()
      }
      const stage = cropStage(doc, t('imageEdit.preview'), ratio, (crop, done) =>
        setCrop(crop, done),
      )

      const cropSet = el('fieldset', 'scriba-image-editor-group')
      const cropLegend = el('legend')
      cropLegend.textContent = t('imageEdit.crop')
      const ratios = el('div', 'scriba-radio-group')
      ratios.setAttribute('role', 'radiogroup')
      ratios.setAttribute('aria-label', t('imageEdit.ratio'))
      for (const [value, key] of RATIOS) {
        const radio = el('input')
        radio.type = 'radio'
        radio.name = `${id}-ratio`
        radio.value = value
        radio.checked = value === ratioChoice
        radio.addEventListener('change', () => {
          if (!radio.checked) return
          ratioChoice = value
          const r = ratio()
          if (r) setCrop(aspectCrop(bounds(), r, edits.crop ?? undefined))
          stage.setCrop(cropRect(edits, source))
        })
        const label = el('label', 'scriba-check')
        label.append(radio, t(key))
        ratios.append(label)
      }
      const numbers = el('div', 'scriba-image-editor-numbers')
      const number = (key: MessageKey, field: keyof Rect) => {
        const input = el('input')
        input.type = 'number'
        input.min = '0'
        input.step = '1'
        input.inputMode = 'numeric'
        input.addEventListener('change', () => {
          const value = Number(input.value)
          const current = cropRect(edits, source)
          if (!input.value || !Number.isFinite(value)) return syncFields()
          let next = clampCrop({ ...current, [field]: value }, bounds())
          const r = ratio()
          if (r && (field === 'width' || field === 'height'))
            next = fitRatio(next, r, bounds(), field)
          setCrop(next)
          stage.setCrop(next)
        })
        const label = el('label')
        label.append(t(key), input)
        numbers.append(label)
        return input
      }
      const fields = {
        x: number('imageEdit.x', 'x'),
        y: number('imageEdit.y', 'y'),
        width: number('imageEdit.width', 'width'),
        height: number('imageEdit.height', 'height'),
      }
      const syncFields = () => {
        const crop = cropRect(edits, source)
        const b = bounds()
        for (const key of ['x', 'y', 'width', 'height'] as const)
          fields[key].value = String(crop[key])
        fields.x.max = String(b.width - crop.width)
        fields.y.max = String(b.height - crop.height)
        fields.width.max = String(b.width)
        fields.height.max = String(b.height)
      }
      const noCrop = button('imageEdit.noCrop', () => {
        edits = { ...edits, crop: null }
        const r = ratio()
        if (r) edits = { ...edits, crop: aspectCrop(bounds(), r) }
        stage.setCrop(cropRect(edits, source))
        syncFields()
        sayStatus()
      })
      noCrop.className = 'scriba-image-editor-link'
      cropSet.append(cropLegend, ratios, numbers, noCrop)

      // --- Adjustments ---
      const adjustSet = el('fieldset', 'scriba-image-editor-group')
      const adjustLegend = el('legend')
      adjustLegend.textContent = t('imageEdit.adjust')
      adjustSet.append(adjustLegend)
      const sliders: [HTMLInputElement, HTMLOutputElement][] = []
      let frame = 0
      for (const [key, labelKey] of [
        ['brightness', 'imageEdit.brightness'],
        ['contrast', 'imageEdit.contrast'],
        ['saturation', 'imageEdit.saturation'],
      ] as const) {
        const range = el('input')
        range.type = 'range'
        range.min = '-100'
        range.max = '100'
        range.step = '1'
        range.value = '0'
        const output = el('output')
        output.textContent = '0'
        range.addEventListener('input', () => {
          output.textContent = range.value
          edits = { ...edits, adjust: { ...edits.adjust, [key]: Number(range.value) } }
          // one preview per frame while the slider moves
          if (!frame)
            frame = (doc.defaultView ?? globalThis).requestAnimationFrame(() => {
              frame = 0
              refresh(false)
            })
        })
        // the value is outside the label: an <output> inside it would be the labelled control
        range.id = `${id}-${key}`
        output.htmlFor.add(range.id)
        const label = el('label')
        label.htmlFor = range.id
        label.textContent = t(labelKey)
        const row = el('div', 'scriba-image-editor-slider')
        row.append(label, output, range)
        adjustSet.append(row)
        sliders.push([range, output])
      }

      const sayStatus = () => {
        const size = outputSize(edits, source)
        status.textContent = t('imageEdit.size', { width: size.width, height: size.height })
      }
      /** Redraws the preview (orientation or colours changed); `crop` also places the rectangle. */
      const refresh = (crop: boolean) => {
        if (!img) return
        const b = bounds()
        const preview = renderEdits(
          doc,
          img,
          source,
          { ...edits, crop: null },
          PREVIEW_SIDE / Math.max(b.width, b.height),
        )
        stage.show(preview, b)
        if (crop) {
          stage.setCrop(cropRect(edits, source))
          syncFields()
          sayStatus()
        }
      }

      // --- Actions ---
      const actions = el('div', 'scriba-dialog-actions')
      const reset = button('imageEdit.reset', () => {
        edits = NO_EDITS
        ratioChoice = 'free'
        for (const radio of ratios.querySelectorAll('input')) radio.checked = radio.value === 'free'
        for (const [range, output] of sliders) range.value = output.textContent = '0'
        refresh(true)
      })
      reset.classList.add('scriba-image-editor-reset')
      const cancel = button('image.cancel', () => handle.close())
      const submit = el('button')
      submit.type = 'submit'
      submit.textContent = t('image.save')
      submit.disabled = true
      actions.append(reset, cancel, submit)
      body.append(tools, stage.element, cropSet, adjustSet)
      form.append(status, body, error, actions)
      reset.disabled = true

      loadEditableImage(doc, original).then(
        (loaded) => {
          img = loaded
          source = { width: loaded.naturalWidth, height: loaded.naturalHeight }
          body.disabled = false
          submit.disabled = false
          reset.disabled = false
          refresh(true)
          tools.querySelector('button')?.focus()
        },
        (err: unknown) => {
          status.textContent = ''
          showError(
            t(
              (err as Error).message === 'foreign'
                ? 'imageEdit.error.foreign'
                : 'imageEdit.error.load',
            ),
          )
          cancel.focus()
        },
      )

      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        if (!img) return
        if (isUnchanged(edits, source)) return handle.close()
        submit.disabled = true
        showError('')
        status.textContent = t('imageEdit.saving')
        const src = await save(img, source, edits)
        submit.disabled = false
        if (typeof src !== 'string') {
          status.textContent = ''
          return showError(src.error)
        }
        if (!apply(view, original, target, src, source.width, outputSize(edits, source).width)) {
          status.textContent = ''
          return showError(t('imageEdit.error.gone'))
        }
        announce(view, t('imageEdit.saved'))
        handle.close()
      })
      queueMicrotask(() => cancel.focus())
    },
  })

  /** Encodes the result and stores it: the upload callback, or a `data:` URL. */
  async function save(
    img: HTMLImageElement,
    source: Size,
    edits: ImageEdits,
  ): Promise<string | { error: string }> {
    try {
      const canvas = renderEdits(doc, img, source, edits, fitScale(outputSize(edits, source)))
      const file = await canvasToFile(canvas, outputType(original))
      if (options.upload) {
        const invalid = validateImageFile(file, options)
        if (invalid)
          return { error: t(invalid, { max: formatSize(options.maxSize ?? DEFAULT_MAX_SIZE) }) }
        announce(view, t('image.uploading'))
        const result = await options.upload(file)
        const src = sanitizeUrl(typeof result === 'string' ? result : result.src, { kind: 'image' })
        return src ?? { error: t('image.error.upload') }
      }
      const src = sanitizeUrl(await fileToDataUrl(file), { kind: 'image' })
      return src ?? { error: t('imageEdit.error.tooLarge') }
    } catch {
      return { error: t(options.upload ? 'image.error.upload' : 'imageEdit.error.encode') }
    }
  }

  return handle
}

/**
 * Replaces the image's `src` (and scales its `width`). The image is looked up
 * again: while the file was uploading the document may have changed (another
 * collaborator). Returns false if it is gone.
 */
function apply(
  view: EditorView,
  original: string,
  target: { pos: number; node: Node },
  src: string,
  sourceWidth: number,
  newWidth: number,
): boolean {
  const state = view.state
  const isTarget = (node: Node | null | undefined) =>
    !!node && node.type.name === 'image' && node.attrs['src'] === original
  let pos: number | null = isTarget(state.doc.nodeAt(target.pos)) ? target.pos : null
  if (pos === null) {
    let best = Infinity
    state.doc.descendants((node, at) => {
      if (isTarget(node) && Math.abs(at - target.pos) < best) {
        best = Math.abs(at - target.pos)
        pos = at
      }
      return true
    })
  }
  if (pos === null) return false
  const node = state.doc.nodeAt(pos)!
  const width = editedWidth(node.attrs['width'] as number | null, sourceWidth, newWidth, {
    min: MIN_WIDTH,
    max: MAX_WIDTH,
  })
  const tr = state.tr.setNodeAttrs(pos, { src, width })
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  view.dispatch(tr.scrollIntoView())
  return true
}
