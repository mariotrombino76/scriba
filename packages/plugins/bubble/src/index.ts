import { Plugin, TextSelection, type Command, type KeyBindings } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { defineScribaToolbar, type ScribaToolbar, type ToolbarItem } from '@scriba/ui'
import type { EditorView, PluginView, ViewPluginProps } from '@scriba/view'

export interface BubbleMenuOptions {
  /** Controls of the bubble (e.g. `markItems(schema)` and the link button). */
  items: ToolbarItem[]
  t: Translate
  /** Whether `Mod` shortcuts are shown as ⌘ (default: platform detection). */
  mac?: boolean
}

const bubbles = new WeakMap<EditorView, { show(): boolean; focus(): boolean }>()

/**
 * Bubble menu: a small formatting toolbar over the selected text. It is a
 * regular `scriba-toolbar` (one tab stop, arrow keys, Escape back to the text),
 * reached with Alt+F10 from the editor (see `bubbleKeymap`). It stays away
 * while the mouse is still selecting, in code blocks and in read-only mode.
 */
export function bubbleMenu(options: BubbleMenuOptions): Plugin {
  const props: ViewPluginProps = { pluginView: (view) => bubbleView(view, options) }
  return new Plugin({ props: { ...props } })
}

/** Alt+F10 moves the focus into the bubble when it is shown. */
export function bubbleKeymap(): KeyBindings {
  const focus: Command = (_state, dispatch, view) => {
    const bubble = view && bubbles.get(view as EditorView)
    if (!bubble || !bubble.show()) return false
    if (dispatch) bubble.focus()
    return true
  }
  return { 'Alt-F10': focus }
}

function bubbleView(view: EditorView, options: BubbleMenuOptions): PluginView {
  const doc = view.document
  defineScribaToolbar(doc.defaultView?.customElements)
  const bar = doc.createElement('scriba-toolbar') as ScribaToolbar
  bar.classList.add('scriba-bubble')
  bar.label = options.t('bubble.label')
  bar.translator = options.t
  if (options.mac !== undefined) bar.mac = options.mac
  bar.hidden = true
  doc.body.appendChild(bar)
  bar.items = options.items
  bar.view = view

  let selecting = false // mouse button down in the editor
  let dismissed: unknown = null // the selection the user closed the bubble on (Escape)

  const wanted = (): boolean => {
    const sel = view.state.selection
    if (!view.editable || selecting || !(sel instanceof TextSelection) || sel.empty) return false
    if (sel.$from.parent.type.spec.code || dismissed === sel) return false
    const active = doc.activeElement
    return view.hasFocus() || (!!active && bar.contains(active))
  }

  const place = () => {
    const { from, to } = view.state.selection
    const a = view.coordsAtPos(from)
    const b = view.coordsAtPos(to)
    const top = Math.min(a.top, b.top)
    const bottom = Math.max(a.bottom, b.bottom)
    const center = a.top === b.top ? (a.left + b.left) / 2 : a.left
    const win = doc.defaultView
    const vw = win?.innerWidth ?? 0
    const w = bar.offsetWidth
    const h = bar.offsetHeight
    // above the selection, below it when there is no room
    let y = top - h - 8
    if (y < 8) y = bottom + 8
    bar.style.top = `${Math.round(y)}px` // CSSOM (strict CSP)
    bar.style.left = `${Math.round(Math.max(8, Math.min(center - w / 2, vw - w - 8)))}px`
  }

  const update = () => {
    const show = wanted()
    if (show !== !bar.hidden) bar.hidden = !show
    if (show) place()
  }

  const onDown = () => {
    selecting = true
    bar.hidden = true
  }
  const onUp = () => {
    if (!selecting) return
    selecting = false
    // the selection is final once the mouse is released
    setTimeout(update, 0)
  }
  const onFocusOut = () => setTimeout(update, 0)
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !bar.hidden && view.hasFocus()) {
      dismissed = view.state.selection
      bar.hidden = true
    }
  }
  const onViewport = () => !bar.hidden && place()
  view.dom.addEventListener('mousedown', onDown)
  doc.addEventListener('mouseup', onUp)
  view.dom.addEventListener('focusout', onFocusOut)
  bar.addEventListener('focusout', onFocusOut)
  view.dom.addEventListener('keydown', onKey)
  doc.defaultView?.addEventListener('scroll', onViewport, true)
  doc.defaultView?.addEventListener('resize', onViewport)

  bubbles.set(view, {
    show: () => !bar.hidden,
    focus: () => {
      const first = bar.querySelector<HTMLElement>('button[tabindex="0"], button')
      first?.focus()
      return !!first
    },
  })
  update()
  return {
    update,
    destroy() {
      view.dom.removeEventListener('mousedown', onDown)
      doc.removeEventListener('mouseup', onUp)
      view.dom.removeEventListener('focusout', onFocusOut)
      view.dom.removeEventListener('keydown', onKey)
      doc.defaultView?.removeEventListener('scroll', onViewport, true)
      doc.defaultView?.removeEventListener('resize', onViewport)
      bar.view = null
      bar.remove()
      bubbles.delete(view)
    },
  }
}
