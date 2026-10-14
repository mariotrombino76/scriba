import type { EditorView } from '@scriba/view'
import { createTranslator, type Translate } from '@scriba/i18n'
import {
  defaultToolbarItems,
  type ToolbarButton,
  type ToolbarItem,
  type ToolbarMenu,
} from './items.js'
import { MenuPopup } from './menu.js'
import { formatShortcut, isMac } from './shortcut.js'

/** Base class: `HTMLElement` when available, so the module can be imported on the server. */
const Base = (globalThis.HTMLElement ?? Object) as typeof HTMLElement

/**
 * `<scriba-toolbar>`: formatting toolbar for an `EditorView`.
 *
 * Accessibility (WAI-ARIA toolbar pattern): one tab stop, arrow keys / Home / End
 * move between buttons (roving tabindex), toggles expose `aria-pressed`,
 * unavailable buttons stay focusable with `aria-disabled`, tooltips show shortcuts,
 * Escape returns to the editor. Light DOM (no shadow root): styles come from
 * `@scriba/themes`, so no inline `<style>` is needed under a strict CSP.
 */
export class ScribaToolbar extends Base {
  private _view: EditorView | null = null
  private _items: ToolbarItem[] | null = null
  private _translate: Translate | null = null
  private unsubscribe: (() => void) | null = null
  private buttons: {
    el: HTMLButtonElement
    item: ToolbarButton | ToolbarMenu
    popup?: MenuPopup
  }[] = []
  private focusIndex = 0
  /** Whether `Mod` shortcuts are shown as ⌘. Defaults to platform detection. */
  mac = isMac()

  get view(): EditorView | null {
    return this._view
  }
  set view(view: EditorView | null) {
    this.unsubscribe?.()
    this._view = view
    this.unsubscribe = view ? view.subscribe(() => this.updateState()) : null
    this.render()
  }

  /** Items to show; defaults to `defaultToolbarItems(view.state.schema)`. */
  get items(): ToolbarItem[] | null {
    return this._items
  }
  set items(items: ToolbarItem[] | null) {
    this._items = items
    this.render()
  }

  /** Translator for labels; defaults to the `lang` of the element or document. */
  get translator(): Translate {
    if (!this._translate) {
      const lang =
        this.closest('[lang]')?.getAttribute('lang') ?? this.ownerDocument.documentElement.lang
      this._translate = createTranslator(lang || 'en')
    }
    return this._translate
  }
  set translator(t: Translate) {
    this._translate = t
    this.render()
  }

  connectedCallback(): void {
    this.setAttribute('role', 'toolbar')
    this.addEventListener('keydown', this.onKeyDown)
    this.addEventListener('focusin', this.onFocusIn)
    this.render()
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.onKeyDown)
    this.removeEventListener('focusin', this.onFocusIn)
  }

  /** Builds the buttons. Only `createElement`/`textContent`: no markup strings. */
  private render(): void {
    if (!this.isConnected) return
    while (this.firstChild) this.removeChild(this.firstChild)
    this.buttons = []
    const t = this.translator
    this.setAttribute('aria-label', t('toolbar.label'))
    if (this.view) this.setAttribute('aria-controls', this.view.dom.id || this.ensureEditorId())
    const items = this._items ?? (this.view ? defaultToolbarItems(this.view.state.schema) : [])
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = this.ownerDocument.createElement('span')
        sep.className = 'scriba-toolbar-separator'
        sep.setAttribute('role', 'separator')
        sep.setAttribute('aria-orientation', 'vertical')
        this.appendChild(sep)
        continue
      }
      const el = this.ownerDocument.createElement('button')
      el.type = 'button'
      el.className = 'scriba-toolbar-button'
      el.dataset['item'] = item.id
      const label = item.label(t)
      el.setAttribute('aria-label', label)
      const shortcut = item.type === 'button' ? item.shortcut : undefined
      el.title = shortcut
        ? t('shortcut.hint', { label, shortcut: formatShortcut(shortcut, t, this.mac) })
        : label
      if (shortcut) el.setAttribute('aria-keyshortcuts', ariaShortcut(shortcut, this.mac))
      const glyph = this.ownerDocument.createElement('span')
      glyph.setAttribute('aria-hidden', 'true')
      glyph.textContent = item.text
      el.appendChild(glyph)
      el.tabIndex = -1
      // Keep the editor's selection when the button is pressed with the mouse.
      el.addEventListener('mousedown', (e) => e.preventDefault())
      this.appendChild(el)
      if (item.type === 'menu') {
        const popup = new MenuPopup(item, el, t, () => this.view)
        el.addEventListener('click', () => this.toggleMenu(popup))
        el.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown' && !popup.isOpen) {
            e.preventDefault()
            e.stopPropagation()
            this.toggleMenu(popup)
          }
        })
        this.appendChild(popup.el)
        this.buttons.push({ el, item, popup })
      } else {
        el.addEventListener('click', () => this.run(item, el))
        this.buttons.push({ el, item })
      }
    }
    this.focusIndex = Math.min(this.focusIndex, Math.max(0, this.buttons.length - 1))
    this.updateState()
  }

  /** Refreshes pressed/disabled state from the editor state. */
  updateState(): void {
    const view = this.view
    this.buttons.forEach(({ el, item }, i) => {
      el.tabIndex = i === this.focusIndex ? 0 : -1
      if (item.type === 'menu') {
        const enabled = !!view && view.editable && item.entries.some((e) => e.command(view.state))
        el.setAttribute('aria-disabled', String(!enabled))
        return
      }
      const enabled =
        !!view && view.editable && (item.command(view.state) || !!item.isActive?.(view.state))
      el.setAttribute('aria-disabled', String(!enabled))
      if (item.isActive)
        el.setAttribute('aria-pressed', String(!!view && item.isActive(view.state)))
    })
  }

  private toggleMenu(popup: MenuPopup): void {
    if (popup.button.getAttribute('aria-disabled') === 'true') return
    for (const b of this.buttons) if (b.popup && b.popup !== popup) b.popup.close(false)
    if (popup.isOpen) popup.close(true)
    else popup.open()
  }

  private run(item: ToolbarButton, el: HTMLButtonElement): void {
    const view = this.view
    if (!view || el.getAttribute('aria-disabled') === 'true') return
    if (item.run) {
      item.run(view)
      return
    }
    item.command(view.state, (tr) => view.dispatch(tr))
    // Mouse users go back to typing; keyboard users stay in the toolbar.
    if (this.ownerDocument.activeElement !== el) view.focus()
  }

  private moveFocus(index: number): void {
    if (!this.buttons.length) return
    this.focusIndex = (index + this.buttons.length) % this.buttons.length
    this.updateState()
    this.buttons[this.focusIndex]!.el.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(this.focusIndex + 1),
      ArrowDown: () => this.moveFocus(this.focusIndex + 1),
      ArrowLeft: () => this.moveFocus(this.focusIndex - 1),
      ArrowUp: () => this.moveFocus(this.focusIndex - 1),
      Home: () => this.moveFocus(0),
      End: () => this.moveFocus(this.buttons.length - 1),
      Escape: () => this.view?.focus(),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  private onFocusIn = (event: FocusEvent): void => {
    const index = this.buttons.findIndex((b) => b.el === event.target)
    if (index >= 0 && index !== this.focusIndex) {
      this.focusIndex = index
      this.updateState()
    }
  }

  private ensureEditorId(): string {
    const id = `scriba-editor-${Math.random().toString(36).slice(2, 10)}`
    this.view!.dom.id = id
    return id
  }
}

function ariaShortcut(binding: string, mac: boolean): string {
  const parts = binding.split(/-(?!$)/)
  const key = parts.pop()!
  const mods = parts.map((p) => (/^mod$/i.test(p) ? (mac ? 'Meta' : 'Control') : p))
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+')
}

/** Registers `<scriba-toolbar>` (idempotent). */
export function defineScribaToolbar(registry: CustomElementRegistry = customElements): void {
  if (!registry.get('scriba-toolbar')) registry.define('scriba-toolbar', ScribaToolbar)
}

declare global {
  interface HTMLElementTagNameMap {
    'scriba-toolbar': ScribaToolbar
  }
}
