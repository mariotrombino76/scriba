import { createTranslator, type MessageKey, type Translate } from '@scriba-editor/i18n'
import type { EditorView } from '@scriba-editor/view'
import type { ToolbarMenu } from './items.js'
import { MenuPopup } from './menu.js'
import { popupEntries, type MenuItem } from './popup-entries.js'
import { isMac } from './shortcut.js'

/** Base class: `HTMLElement` when available, so the module can be imported on the server. */
const Base = (globalThis.HTMLElement ?? Object) as typeof HTMLElement

/**
 * One menu of the bar ("File", "Modifica"…): toolbar buttons, menus (shown
 * as sub-menus) or entries; `'|'` separates groups, as in TinyMCE's menus.
 */
export interface MenubarMenu {
  id: string
  label: MessageKey | ((t: Translate) => string)
  items: MenuItem[]
}

/**
 * `<scriba-menubar>`: a menu bar above the toolbar, like TinyMCE's (File,
 * Edit, View, Insert, Format…). WAI-ARIA menubar pattern: one tab stop,
 * Left/Right move between menus (also while one is open), Down/Enter/Space
 * open, hovering another menu while one is open switches to it, Escape
 * closes. It reuses the toolbar's controls: a toolbar menu becomes a
 * sub-menu, and every entry is enabled exactly as in the toolbar (read-only,
 * commenting…).
 */
export class ScribaMenubar extends Base {
  private _view: EditorView | null = null
  private _menus: MenubarMenu[] = []
  private _translate: Translate | null = null
  private buttons: HTMLButtonElement[] = []
  private popups: MenuPopup[] = []
  private sub: MenuPopup | null = null
  private focusIndex = 0
  mac = isMac()

  get view(): EditorView | null {
    return this._view
  }
  set view(view: EditorView | null) {
    this._view = view
    this.render()
  }

  get menus(): MenubarMenu[] {
    return this._menus
  }
  set menus(menus: MenubarMenu[]) {
    this._menus = menus
    this.render()
  }

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
    this.setAttribute('role', 'menubar')
    this.render()
  }

  private label(menu: MenubarMenu): string {
    return typeof menu.label === 'function'
      ? menu.label(this.translator)
      : this.translator(menu.label)
  }

  private createSubmenu(menu: ToolbarMenu, index: number): MenuPopup {
    const popup = new MenuPopup(
      menu,
      this.buttons[index]!,
      this.translator,
      () => this._view,
      this.mac,
      (dir) => this.switchTo(index + dir),
    )
    this.appendChild(popup.el)
    return popup
  }

  private render(): void {
    if (!this.isConnected) return
    for (const p of this.popups) p.close(false)
    this.sub?.close(false)
    this.replaceChildren()
    this.buttons = []
    this.popups = []
    this.sub = null
    this.setAttribute('aria-label', this.translator('menubar.label'))
    this._menus.forEach((menu, i) => {
      const button = this.ownerDocument.createElement('button')
      button.type = 'button'
      button.className = 'scriba-menubar-item'
      button.setAttribute('role', 'menuitem')
      button.textContent = this.label(menu)
      button.tabIndex = i === this.focusIndex ? 0 : -1
      const submenus = new Map<ToolbarMenu, MenuPopup>()
      const entries = popupEntries(menu.items, (sub) => {
        let popup = submenus.get(sub)
        if (!popup) submenus.set(sub, (popup = this.createSubmenu(sub, i)))
        this.sub = popup
        popup.open(this.buttons[i]!)
      })
      const popup = new MenuPopup(
        { label: () => this.label(menu), entries },
        button,
        this.translator,
        () => this._view,
        this.mac,
        (dir) => this.switchTo(i + dir),
      )
      button.addEventListener('click', () => (popup.isOpen ? popup.close(true) : this.openAt(i)))
      button.addEventListener('mouseenter', () => {
        if (this.openIndex() >= 0 && this.openIndex() !== i) this.openAt(i)
      })
      button.addEventListener('keydown', (e) => this.onKey(e, i))
      this.append(button, popup.el)
      this.buttons.push(button)
      this.popups.push(popup)
    })
  }

  /** Index of the open menu (or of the bar item a sub-menu belongs to), -1 if none. */
  private openIndex(): number {
    const i = this.popups.findIndex((p) => p.isOpen)
    if (i >= 0 || !this.sub?.isOpen) return i
    const sub = this.sub
    return this.buttons.findIndex((b) => b === sub.button)
  }

  private openAt(index: number): void {
    for (const p of this.popups) p.close(false)
    this.sub?.close(false)
    this.focusItem(index)
    this.popups[index]?.open()
  }

  /** Left/Right from an open menu: the neighbouring menu opens. */
  private switchTo(index: number): void {
    const n = this.buttons.length
    if (!n) return
    this.openAt((index + n) % n)
  }

  private focusItem(index: number): void {
    const n = this.buttons.length
    this.focusIndex = (index + n) % n
    this.buttons.forEach((b, i) => (b.tabIndex = i === this.focusIndex ? 0 : -1))
    this.buttons[this.focusIndex]?.focus({ preventScroll: true })
  }

  private onKey(event: KeyboardEvent, index: number): void {
    const keys: Record<string, () => void> = {
      ArrowRight: () => this.focusItem(index + 1),
      ArrowLeft: () => this.focusItem(index - 1),
      Home: () => this.focusItem(0),
      End: () => this.focusItem(this.buttons.length - 1),
      ArrowDown: () => this.openAt(index),
      Enter: () => this.openAt(index),
      ' ': () => this.openAt(index),
      Escape: () => this._view?.focus(),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }
}

export function defineScribaMenubar(registry: CustomElementRegistry = customElements): void {
  if (!registry.get('scriba-menubar')) registry.define('scriba-menubar', ScribaMenubar)
}

declare global {
  interface HTMLElementTagNameMap {
    'scriba-menubar': ScribaMenubar
  }
}
