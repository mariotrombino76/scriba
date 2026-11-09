import { moveCrop, resizeCrop, type Handle, type Rect, type Size } from './edit-geometry.js'

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export interface CropStage {
  readonly element: HTMLElement
  /** Shows a new preview of the oriented image (its pixels map to `bounds`). */
  show(preview: HTMLCanvasElement, bounds: Size): void
  /** Places the crop rectangle (in image pixels). */
  setCrop(crop: Rect): void
}

/**
 * The preview with the crop rectangle over it. The rectangle is moved by
 * dragging it and resized by its handles (mouse, pen, touch); the same can be
 * done from the keyboard with the number fields of the dialog, so the
 * rectangle itself is hidden from assistive technology. Positions are set
 * through CSSOM, in percentages (strict CSP, any preview size).
 */
export function cropStage(
  doc: Document,
  label: string,
  ratio: () => number | null,
  onCrop: (crop: Rect, done: boolean) => void,
): CropStage {
  const stage = doc.createElement('div')
  stage.className = 'scriba-image-editor-stage'
  const canvas = doc.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', label)
  const box = doc.createElement('div')
  box.className = 'scriba-crop-box'
  box.setAttribute('aria-hidden', 'true')
  for (const handle of HANDLES) {
    const h = doc.createElement('span')
    h.className = `scriba-crop-handle scriba-crop-${handle}`
    h.dataset['handle'] = handle
    box.append(h)
  }
  // the darkened outside is clipped to the image; the handles must not be
  const shade = doc.createElement('div')
  shade.className = 'scriba-crop-shade'
  const hole = doc.createElement('div')
  hole.className = 'scriba-crop-window'
  shade.append(hole)
  stage.append(canvas, shade, box)

  let bounds: Size = { width: 1, height: 1 }
  let crop: Rect = { x: 0, y: 0, width: 1, height: 1 }

  const place = () => {
    const pct = (n: number, of: number) => `${(n / of) * 100}%`
    for (const el of [box, hole]) {
      el.style.left = pct(crop.x, bounds.width)
      el.style.top = pct(crop.y, bounds.height)
      el.style.width = pct(crop.width, bounds.width)
      el.style.height = pct(crop.height, bounds.height)
    }
  }

  let drag: {
    id: number
    handle: Handle | 'move'
    x: number
    y: number
    start: Rect
    scale: number
  } | null = null

  box.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return
    event.preventDefault()
    const target = event.target as HTMLElement
    const shown = canvas.getBoundingClientRect().width
    drag = {
      id: event.pointerId,
      handle: (target.dataset['handle'] as Handle | undefined) ?? 'move',
      x: event.clientX,
      y: event.clientY,
      start: crop,
      // image pixels per screen pixel
      scale: shown ? bounds.width / shown : 1,
    }
    box.setPointerCapture(event.pointerId)
    box.classList.add('scriba-crop-dragging')
  })
  box.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return
    const dx = (event.clientX - drag.x) * drag.scale
    const dy = (event.clientY - drag.y) * drag.scale
    crop =
      drag.handle === 'move'
        ? moveCrop(drag.start, dx, dy, bounds)
        : resizeCrop(drag.start, drag.handle, dx, dy, bounds, ratio())
    place()
    onCrop(crop, false)
  })
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    drag = null
    box.classList.remove('scriba-crop-dragging')
    onCrop(crop, true)
  }
  box.addEventListener('pointerup', end)
  box.addEventListener('pointercancel', end)

  return {
    element: stage,
    show(preview, size) {
      bounds = size
      canvas.width = preview.width
      canvas.height = preview.height
      canvas.getContext('2d')?.drawImage(preview, 0, 0)
    },
    setCrop(next) {
      crop = next
      place()
    },
  }
}
