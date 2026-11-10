import type { Translate } from '@scriba-editor/i18n'
import type { EditorView } from '@scriba-editor/view'

export interface ResizeOptions {
  /** Smallest height in pixels. Default 120. */
  minHeight?: number
  /** Largest height in pixels. Default: no limit. */
  maxHeight?: number
  /** Pixels per arrow key. Default 20 (Page Up/Down: five times as much). */
  step?: number
}

/** Class on the editor once it has a set height (it scrolls inside). */
export const SIZED_CLASS = 'scriba-sized'

/**
 * Resize handle, like TinyMCE's status bar corner: drag it (mouse, pen,
 * touch) or use the arrow keys to change the editor's height; double-click or
 * Escape gives it back its natural height. The height is set via CSSOM (no
 * inline style attribute, strict CSP). Put `el` under the editor.
 */
export function createResizeHandle(
  view: EditorView,
  t: Translate,
  options: ResizeOptions = {},
): { el: HTMLButtonElement; destroy(): void } {
  const doc = view.document
  const editor = view.dom
  const min = options.minHeight ?? 120
  const max = options.maxHeight ?? Infinity
  const step = options.step ?? 20
  const el = doc.createElement('button')
  el.type = 'button'
  el.className = 'scriba-statusbar-resize'
  el.setAttribute('aria-label', t('resize.label'))
  el.title = t('resize.label')

  const setHeight = (height: number | null) => {
    if (height === null) {
      editor.style.removeProperty('height')
      if (!editor.style.length) editor.removeAttribute('style')
      editor.classList.remove(SIZED_CLASS)
      return
    }
    editor.style.height = `${Math.round(Math.min(max, Math.max(min, height)))}px`
    editor.classList.add(SIZED_CLASS)
  }
  const current = () => editor.getBoundingClientRect().height

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = current()
    // followed on the whole page (no pointer capture: Firefox reports wrong coordinates with it)
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) setHeight(startHeight + ev.clientY - startY)
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', up)
      doc.removeEventListener('pointercancel', up)
    }
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', up)
    doc.addEventListener('pointercancel', up)
  })
  el.addEventListener('keydown', (e) => {
    const delta =
      e.key === 'ArrowDown' ? step
      : e.key === 'ArrowUp' ? -step
      : e.key === 'PageDown' ? step * 5
      : e.key === 'PageUp' ? -step * 5
      : 0 // prettier-ignore
    if (delta) setHeight(current() + delta)
    else if (e.key === 'Escape' && editor.classList.contains(SIZED_CLASS)) setHeight(null)
    else return
    e.preventDefault()
  })
  el.addEventListener('dblclick', () => setHeight(null))
  return {
    el,
    destroy() {
      setHeight(null)
      el.remove()
    },
  }
}
