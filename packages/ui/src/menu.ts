import { normalizeColor } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'
import { createIcon } from './icons.js'
import type { ToolbarMenu, ToolbarMenuEntry } from './items.js'
import { formatShortcut } from './shortcut.js'

let menuCount = 0

/** Entry of a popup: a menu entry, optionally with its own action or a sub-menu. */
export interface PopupEntry extends ToolbarMenuEntry {
  /** Runs instead of `command` (e.g. opens another menu). */
  run?: (view: EditorView) => void
  /** Shows a chevron and `aria-haspopup`. */
  hasPopup?: boolean
  /** With `isActive`: a toggle (`menuitemcheckbox`) instead of a choice (`menuitemradio`). */
  toggle?: boolean
}

/**
 * Popup of a toolbar menu button (WAI-ARIA menu pattern): opens on click or
 * Enter/Space/ArrowDown, arrows move between entries, Enter/Space choose,
 * Escape closes and returns focus to the button (or the anchor it was opened
 * from), Tab closes.
 */
export class MenuPopup {
  readonly el: HTMLDivElement
  private readonly entries: { el: HTMLButtonElement; entry: PopupEntry }[] = []
  private index = 0
  private anchor: HTMLElement

  constructor(
    menu: Pick<ToolbarMenu, 'label' | 'layout'> & { entries: PopupEntry[] },
    readonly button: HTMLButtonElement,
    t: Translate,
    private readonly getView: () => EditorView | null,
    mac = false,
  ) {
    const doc = button.ownerDocument
    this.anchor = button
    this.el = doc.createElement('div')
    this.el.className = 'scriba-toolbar-menu'
    this.el.id = `scriba-menu-${++menuCount}`
    this.el.setAttribute('role', 'menu')
    this.el.setAttribute('aria-label', menu.label(t))
    this.el.hidden = true
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', this.el.id)

    const grid = menu.layout === 'grid' ? doc.createElement('div') : null
    if (grid) {
      grid.className = 'scriba-toolbar-menu-grid'
      this.el.appendChild(grid)
    }
    for (const entry of menu.entries) {
      const el = doc.createElement('button')
      el.type = 'button'
      el.tabIndex = -1
      el.dataset['entry'] = entry.id
      el.setAttribute(
        'role',
        entry.isActive ? (entry.toggle ? 'menuitemcheckbox' : 'menuitemradio') : 'menuitem',
      )
      el.setAttribute('aria-label', entry.label(t))
      const color = entry.swatch ? normalizeColor(entry.swatch) : null
      if (grid && color) {
        // Grid swatch: the name is the accessible label and the tooltip.
        el.className = 'scriba-toolbar-swatch'
        el.title = entry.label(t)
        el.style.backgroundColor = color // CSSOM, validated color
        el.appendChild(createIcon(doc, 'check', 16))
        grid.appendChild(el)
      } else {
        el.className = 'scriba-toolbar-menu-item' + (entry.preview ? ` ${entry.preview}` : '')
        if (color) {
          const swatch = doc.createElement('span')
          swatch.className = 'scriba-swatch'
          swatch.setAttribute('aria-hidden', 'true')
          swatch.style.backgroundColor = color
          el.appendChild(swatch)
        } else if (entry.icon) {
          el.appendChild(createIcon(doc, entry.icon))
        } else if (entry.isActive) {
          const check = createIcon(doc, 'check', 16)
          check.classList.add('scriba-check-mark')
          el.appendChild(check)
        }
        const text = doc.createElement('span')
        text.className = 'scriba-toolbar-menu-text'
        text.textContent = entry.text ?? entry.label(t)
        el.appendChild(text)
        if (entry.shortcut) {
          const key = doc.createElement('span')
          key.className = 'scriba-toolbar-menu-key'
          key.setAttribute('aria-hidden', 'true')
          key.textContent = formatShortcut(entry.shortcut, t, mac)
          el.appendChild(key)
          el.setAttribute('aria-keyshortcuts', entry.shortcut)
        }
        if (entry.hasPopup) {
          el.setAttribute('aria-haspopup', 'menu')
          const chevron = createIcon(doc, 'chevronRight', 16)
          chevron.classList.add('scriba-toolbar-menu-key')
          el.appendChild(chevron)
        }
        this.el.appendChild(el)
      }
      el.addEventListener('mousedown', (e) => e.preventDefault())
      el.addEventListener('click', () => this.choose(entry, el))
      this.entries.push({ el, entry })
    }
    this.el.addEventListener('keydown', this.onKeyDown)
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Opens under `anchor` (default: the menu's own button); focus returns there on Escape. */
  open(anchor: HTMLElement = this.button): void {
    this.anchor = anchor
    const state = this.getView()?.state
    let active = -1
    this.entries.forEach(({ el, entry }, i) => {
      const enabled = !!state && (entry.run ? true : entry.command(state))
      el.setAttribute('aria-disabled', String(!enabled))
      if (entry.isActive) {
        const on = !!state && entry.isActive(state)
        el.setAttribute('aria-checked', String(on))
        if (on && active < 0) active = i
      }
    })
    // Position under the anchor (CSSOM: no inline style attribute).
    this.el.style.left = `${anchor.offsetLeft}px`
    this.el.style.top = `${anchor.offsetTop + anchor.offsetHeight + 4}px`
    this.el.hidden = false
    anchor.setAttribute('aria-expanded', 'true')
    this.focus(Math.max(0, active))
    this.button.ownerDocument.addEventListener('mousedown', this.onOutside, true)
  }

  close(returnFocus = true): void {
    if (!this.isOpen) return
    this.el.hidden = true
    this.anchor.setAttribute('aria-expanded', 'false')
    this.button.ownerDocument.removeEventListener('mousedown', this.onOutside, true)
    if (returnFocus) this.anchor.focus()
  }

  private focus(index: number): void {
    if (!this.entries.length) return
    this.index = (index + this.entries.length) % this.entries.length
    this.entries[this.index]!.el.focus()
  }

  private choose(entry: PopupEntry, el: HTMLButtonElement): void {
    const view = this.getView()
    if (!view || el.getAttribute('aria-disabled') === 'true') return
    if (entry.run) {
      this.close(false)
      entry.run(view)
      return
    }
    entry.command(view.state, (tr) => view.dispatch(tr), view)
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
    if (target && (this.el.contains(target) || this.anchor.contains(target))) return
    this.close(false)
  }
}
