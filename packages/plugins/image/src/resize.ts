import { NodeSelection } from '@scriba/core'
import type { EditorView, PluginView } from '@scriba/view'
import { MAX_WIDTH, MIN_WIDTH } from './nodes.js'

/**
 * Resize handles for the selected image (pointer only; keyboard users set the
 * width in the image dialog). The overlay lives outside the editable area,
 * fixed-positioned over the image, so the editor DOM is never touched.
 * Positions and sizes are set through CSSOM (strict CSP).
 */
export function resizeView(view: EditorView): PluginView {
  const doc = view.document
  const overlay = doc.createElement('div')
  overlay.className = 'scriba-image-resizer'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.hidden = true
  const handles = (['w', 'e'] as const).map((side) => {
    const handle = doc.createElement('span')
    handle.className = `scriba-resize-handle scriba-resize-${side}`
    handle.dataset['side'] = side
    overlay.appendChild(handle)
    return handle
  })
  doc.body.appendChild(overlay)

  let target: { pos: number; img: HTMLImageElement } | null = null
  let drag: { side: 'w' | 'e'; startX: number; startWidth: number; pointer: number } | null = null

  const findImage = (): { pos: number; img: HTMLImageElement } | null => {
    const sel = view.state.selection
    if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image' || !view.editable)
      return null
    const { node, offset } = view.domAtPos(sel.from)
    const img = node.childNodes[offset]
    return img instanceof HTMLImageElement ? { pos: sel.from, img } : null
  }

  const place = () => {
    if (!target) {
      overlay.hidden = true
      return
    }
    const r = target.img.getBoundingClientRect()
    overlay.hidden = false
    overlay.style.left = `${r.left}px`
    overlay.style.top = `${r.top}px`
    overlay.style.width = `${r.width}px`
    overlay.style.height = `${r.height}px`
  }

  const maxWidth = () => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, view.dom.clientWidth - 8))

  const onPointerDown = (event: PointerEvent) => {
    const handle = event.target as HTMLElement
    const side = handle.dataset['side'] as 'w' | 'e' | undefined
    if (!side || !target) return
    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
    drag = {
      side,
      startX: event.clientX,
      startWidth: target.img.getBoundingClientRect().width,
      pointer: event.pointerId,
    }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || !target || event.pointerId !== drag.pointer) return
    const dx = event.clientX - drag.startX
    const width = Math.round(
      Math.max(MIN_WIDTH, Math.min(maxWidth(), drag.startWidth + (drag.side === 'e' ? dx : -dx))),
    )
    target.img.style.width = `${width}px` // live preview (CSSOM); the model is updated on release
    target.img.style.height = 'auto'
    place()
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || !target || event.pointerId !== drag.pointer) return
    const width = Math.round(target.img.getBoundingClientRect().width)
    const { pos, img } = target
    drag = null
    img.style.removeProperty('width')
    img.style.removeProperty('height')
    view.dispatch(
      view.state.tr.setNodeAttrs(pos, { width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)) }),
    )
    view.focus()
  }
  for (const handle of handles) handle.addEventListener('pointerdown', onPointerDown)
  overlay.addEventListener('pointermove', onPointerMove)
  overlay.addEventListener('pointerup', onPointerUp)
  overlay.addEventListener('pointercancel', onPointerUp)
  const win = doc.defaultView
  const onViewport = () => place()
  win?.addEventListener('scroll', onViewport, true)
  win?.addEventListener('resize', onViewport)

  const update = () => {
    if (drag) return
    target = findImage()
    // wait for images to load before measuring
    if (target && !target.img.complete) target.img.addEventListener('load', place, { once: true })
    place()
  }
  update()

  return {
    update,
    destroy() {
      win?.removeEventListener('scroll', onViewport, true)
      win?.removeEventListener('resize', onViewport)
      overlay.remove()
    },
  }
}
