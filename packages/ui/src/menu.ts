import { normalizeColor } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'
import { createIcon } from './icons.js'
import {
  controlUsable,
  transactionAllowed,
  type ToolbarMenu,
  type ToolbarMenuEntry,
} from './items.js'
import { formatShortcut } from './shortcut.js'

let menuCount = 0

/** Entry of a popup: a menu entry, optionally with its own action or a sub-menu. */
export interface PopupEntry extends ToolbarMenuEntry {
  /** Shows a chevron and `aria-haspopup`. */
  hasPopup?: boolean
  /** A separator line before this entry (groups of a menu bar menu). */
  separatorBefore?: boolean
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
  /** Columns of a `size` picker (0 = not a picker). */
  private readonly columns: number
  private readonly sizeLabel: HTMLElement | null = null

  constructor(
    menu: Pick<ToolbarMenu, 'label' | 'layout' | 'columns'> & { entries: PopupEntry[] },
    readonly button: HTMLButtonElement,
    t: Translate,
    private readonly getView: () => EditorView | null,
    mac = false,
    /** In a menu bar: Left/Right go to the previous/next menu (WAI-ARIA menubar). */
    private readonly onHorizontal?: (dir: 1 | -1) => void,
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
    this.columns = menu.layout === 'size' ? Math.max(1, menu.columns ?? 8) : 0
    const picker = this.columns ? doc.createElement('div') : null
    if (picker) {
      picker.className = 'scriba-size-grid'
      picker.style.gridTemplateColumns = `repeat(${this.columns}, auto)` // CSSOM
      const label = doc.createElement('div')
      label.className = 'scriba-size-label'
      label.setAttribute('aria-hidden', 'true') // each cell has its own accessible name
      this.el.append(picker, label)
      this.sizeLabel = label
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
      if (picker && entry.cell) {
        // Size picker cell: hovering or focusing it highlights the area it stands for.
        el.className = 'scriba-size-cell'
        el.title = entry.label(t)
        const cell = entry.cell
        el.addEventListener('mouseenter', () => this.highlight(cell))
        el.addEventListener('focus', () => this.highlight(cell))
        picker.appendChild(el)
      } else if (grid && color) {
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
        if (entry.separatorBefore) {
          const line = doc.createElement('div')
          line.setAttribute('role', 'separator')
          line.className = 'scriba-toolbar-menu-separator'
          this.el.appendChild(line)
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
      const view = this.getView()
      // `run` entries are enabled by their command too; read-only editors only allow read-only entries
      const enabled = !!state && !!view && controlUsable(view, entry) && entry.command(state)
      el.setAttribute('aria-disabled', String(!enabled))
      if (entry.isActive) {
        const on = !!state && entry.isActive(state)
        el.setAttribute('aria-checked', String(on))
        if (on && active < 0) active = i
      }
    })
    this.el.hidden = false
    this.position(anchor)
    anchor.setAttribute('aria-expanded', 'true')
    this.focus(Math.max(0, active))
    const doc = this.button.ownerDocument
    doc.addEventListener('mousedown', this.onOutside, true)
    doc.defaultView?.addEventListener('scroll', this.onViewportChange, true)
    doc.defaultView?.addEventListener('resize', this.onViewportChange)
  }

  close(returnFocus = true): void {
    if (!this.isOpen) return
    this.el.hidden = true
    this.anchor.setAttribute('aria-expanded', 'false')
    const doc = this.button.ownerDocument
    doc.removeEventListener('mousedown', this.onOutside, true)
    doc.defaultView?.removeEventListener('scroll', this.onViewportChange, true)
    doc.defaultView?.removeEventListener('resize', this.onViewportChange)
    if (returnFocus) this.anchor.focus({ preventScroll: true })
  }

  /**
   * Fixed positioning under the anchor, kept inside the viewport. Fixed: the
   * toolbar clips its overflow (one-line layout), the menu must not be clipped.
   * Set through CSSOM: no inline style attribute (strict CSP).
   */
  private position(anchor: HTMLElement): void {
    const win = anchor.ownerDocument.defaultView
    const rect = anchor.getBoundingClientRect()
    const width = this.el.offsetWidth
    const height = this.el.offsetHeight
    const vw = win?.innerWidth ?? 0
    const vh = win?.innerHeight ?? 0
    let left = rect.left
    if (vw && left + width > vw - 8) left = Math.max(8, vw - width - 8)
    let top = rect.bottom + 4
    // Not enough room below and more above: open upwards.
    if (vh && top + height > vh - 8 && rect.top - height - 4 > 8) top = rect.top - height - 4
    this.el.style.left = `${left}px`
    this.el.style.top = `${top}px`
  }

  /** Highlights the cells of a size picker up to (rows, columns). */
  private highlight([rows, cols]: readonly [number, number]): void {
    for (const { el, entry } of this.entries) {
      if (!entry.cell) continue
      el.classList.toggle('scriba-size-on', entry.cell[0] <= rows && entry.cell[1] <= cols)
    }
    if (this.sizeLabel) this.sizeLabel.textContent = `${rows} × ${cols}`
  }

  /** Arrow keys in a size picker move in two dimensions. */
  private moveInPicker(key: string): boolean {
    const current = this.entries[this.index]?.entry.cell
    if (!this.columns || !current) return false
    const cells = this.entries.filter((e) => e.entry.cell).length
    const col = current[1] - 1
    let next = this.index
    if (key === 'ArrowRight' && col < this.columns - 1) next++
    else if (key === 'ArrowLeft' && col > 0) next--
    else if (key === 'ArrowDown') next += this.columns
    else if (key === 'ArrowUp') next -= this.columns
    else return key === 'ArrowRight' || key === 'ArrowLeft' // stay at the row edge
    if (next < 0) return true
    // below the last row: the first entry after the picker
    this.focus(Math.min(next, next >= cells ? cells : next))
    return true
  }

  private focus(index: number): void {
    if (!this.entries.length) return
    this.index = (index + this.entries.length) % this.entries.length
    this.entries[this.index]!.el.focus({ preventScroll: true })
  }

  private choose(entry: PopupEntry, el: HTMLButtonElement): void {
    const view = this.getView()
    if (!view || el.getAttribute('aria-disabled') === 'true') return
    if (entry.run) {
      this.close(false)
      entry.run(view)
      return
    }
    entry.command(view.state, (tr) => transactionAllowed(view, tr) && view.dispatch(tr), view)
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
    if (event.key.startsWith('Arrow') && this.moveInPicker(event.key)) {
      event.preventDefault()
      return
    }
    if (this.onHorizontal && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      const current = this.entries[this.index]
      // Right on an entry with a sub-menu opens it; otherwise the next menu of the bar
      if (event.key === 'ArrowRight' && current?.entry.hasPopup) current.el.click()
      else this.onHorizontal(event.key === 'ArrowRight' ? 1 : -1)
      return
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  /** Page scrolled or window resized: the menu would be misplaced, so it closes. */
  private onViewportChange = (event: Event): void => {
    const target = event.target as globalThis.Node | null
    if (target && target !== this.button.ownerDocument && this.el.contains(target)) return // scrolling the menu itself
    this.close(false)
  }

  private onOutside = (event: MouseEvent): void => {
    const target = event.target as globalThis.Node | null
    if (target && (this.el.contains(target) || this.anchor.contains(target))) return
    this.close(false)
  }
}
