import { normalizeColor } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'
import type { ToolbarMenu, ToolbarMenuEntry } from './items.js'

let menuCount = 0

/**
 * Popup of a toolbar menu button (WAI-ARIA menu pattern): opens on click or
 * Enter/Space/ArrowDown, arrows move between entries, Enter/Space choose,
 * Escape closes and returns focus to the button, Tab closes.
 */
export class MenuPopup {
  readonly el: HTMLDivElement
  private readonly entries: { el: HTMLButtonElement; entry: ToolbarMenuEntry }[] = []
  private index = 0

  constructor(
    private readonly menu: ToolbarMenu,
    readonly button: HTMLButtonElement,
    t: Translate,
    private readonly getView: () => EditorView | null,
  ) {
    const doc = button.ownerDocument
    this.el = doc.createElement('div')
    this.el.className = 'scriba-toolbar-menu'
    this.el.id = `scriba-menu-${++menuCount}`
    this.el.setAttribute('role', 'menu')
    this.el.setAttribute('aria-label', menu.label(t))
    this.el.hidden = true
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', this.el.id)

    for (const entry of menu.entries) {
      const el = doc.createElement('button')
      el.type = 'button'
      el.className = 'scriba-toolbar-menu-item'
      el.tabIndex = -1
      el.dataset['entry'] = entry.id
      el.setAttribute('role', entry.isActive ? 'menuitemradio' : 'menuitem')
      const color = entry.swatch ? normalizeColor(entry.swatch) : null
      if (color) {
        const swatch = doc.createElement('span')
        swatch.className = 'scriba-swatch'
        swatch.setAttribute('aria-hidden', 'true')
        swatch.style.backgroundColor = color // CSSOM, validated color
        el.appendChild(swatch)
      }
      const text = doc.createElement('span')
      text.textContent = entry.text ?? entry.label(t)
      el.appendChild(text)
      el.setAttribute('aria-label', entry.label(t))
      el.addEventListener('mousedown', (e) => e.preventDefault())
      el.addEventListener('click', () => this.choose(entry, el))
      this.el.appendChild(el)
      this.entries.push({ el, entry })
    }
    this.el.addEventListener('keydown', this.onKeyDown)
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  open(): void {
    const state = this.getView()?.state
    let active = 0
    this.entries.forEach(({ el, entry }, i) => {
      const enabled = !!state && entry.command(state)
      el.setAttribute('aria-disabled', String(!enabled))
      if (entry.isActive) {
        const on = !!state && entry.isActive(state)
        el.setAttribute('aria-checked', String(on))
        if (on) active = i
      }
    })
    // Position under the button (CSSOM: no inline style attribute).
    this.el.style.left = `${this.button.offsetLeft}px`
    this.el.style.top = `${this.button.offsetTop + this.button.offsetHeight}px`
    this.el.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    this.focus(active)
    this.button.ownerDocument.addEventListener('mousedown', this.onOutside, true)
  }

  close(returnFocus = true): void {
    if (!this.isOpen) return
    this.el.hidden = true
    this.button.setAttribute('aria-expanded', 'false')
    this.button.ownerDocument.removeEventListener('mousedown', this.onOutside, true)
    if (returnFocus) this.button.focus()
  }

  private focus(index: number): void {
    if (!this.entries.length) return
    this.index = (index + this.entries.length) % this.entries.length
    this.entries[this.index]!.el.focus()
  }

  private choose(entry: ToolbarMenuEntry, el: HTMLButtonElement): void {
    const view = this.getView()
    if (!view || el.getAttribute('aria-disabled') === 'true') return
    entry.command(view.state, (tr) => view.dispatch(tr))
    this.close(false)
    view.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation() // the toolbar's own arrow navigation must not run here
    const keys: Record<string, () => void> = {
      ArrowDown: () => this.focus(this.index + 1),
      ArrowRight: () => this.focus(this.index + 1),
      ArrowUp: () => this.focus(this.index - 1),
      ArrowLeft: () => this.focus(this.index - 1),
      Home: () => this.focus(0),
      End: () => this.focus(this.entries.length - 1),
      Escape: () => this.close(true),
    }
    if (event.key === 'Tab') {
      this.close(false)
      return
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  private onOutside = (event: MouseEvent): void => {
    const target = event.target as globalThis.Node | null
    if (target && (this.el.contains(target) || this.button.contains(target))) return
    this.close(false)
  }
}
