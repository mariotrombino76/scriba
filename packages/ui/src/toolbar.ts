import { normalizeColor } from '@scriba/core'
import { createTranslator, type Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'
import { createIcon } from './icons.js'
import {
  controlUsable,
  defaultToolbarItems,
  transactionAllowed,
  type ToolbarButton,
  type ToolbarControl,
  type ToolbarItem,
} from './items.js'
import { MenuPopup, type PopupEntry } from './menu.js'
import { formatShortcut, isMac } from './shortcut.js'

const OVERFLOW = 'scriba-toolbar-overflow'
const overflowed = (c: { el: HTMLElement }) => c.el.classList.contains(OVERFLOW)

/** Base class: `HTMLElement` when available, so the module can be imported on the server. */
const Base = (globalThis.HTMLElement ?? Object) as typeof HTMLElement

interface Rendered {
  el: HTMLButtonElement
  item: ToolbarControl
  group: HTMLElement
  priority: number
  order: number
  popup?: MenuPopup
  value?: HTMLElement
  indicator?: HTMLElement
}

interface GroupSpec {
  id: string
  label: string | null
  items: ToolbarControl[]
  priority: number
}

/**
 * `<scriba-toolbar>`: formatting toolbar for an `EditorView`.
 *
 * Accessibility (WAI-ARIA toolbar pattern): one tab stop, arrow keys / Home / End
 * move between controls (roving tabindex), named groups (`role="group"`),
 * toggles expose `aria-pressed`, menus are menu buttons, unavailable controls
 * stay focusable with `aria-disabled`, tooltips show shortcuts, Escape returns
 * to the editor. When the toolbar is too narrow, trailing groups move into the
 * "More options" menu instead of wrapping.
 *
 * Light DOM (no shadow root): styles come from `@scriba/themes`, so no inline
 * `<style>` is needed under a strict CSP.
 */
export class ScribaToolbar extends Base {
  private _view: EditorView | null = null
  private _items: ToolbarItem[] | null = null
  private _translate: Translate | null = null
  private unsubscribe: (() => void) | null = null
  private controls: Rendered[] = []
  private groups: HTMLElement[] = []
  private moreButton: HTMLButtonElement | null = null
  private morePopup: MenuPopup | null = null
  private resizeObserver: ResizeObserver | null = null
  private focusIndex = 0
  /** Whether `Mod` shortcuts are shown as ⌘. Defaults to platform detection. */
  mac = isMac()
  /** Accessible name (default: the translated "toolbar.label"), e.g. for a second toolbar. */
  label: string | null = null

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
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.layout())
      this.resizeObserver.observe(this)
    }
    this.render()
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.onKeyDown)
    this.removeEventListener('focusin', this.onFocusIn)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  /** Normalizes items into groups (legacy separators split groups). */
  private groupItems(items: ToolbarItem[]): GroupSpec[] {
    const t = this.translator
    const out: GroupSpec[] = []
    let loose: ToolbarControl[] = []
    const flush = () => {
      if (loose.length)
        out.push({ id: `group-${out.length}`, label: null, items: loose, priority: 1 })
      loose = []
    }
    for (const item of items) {
      if (item.type === 'group') {
        flush()
        if (item.items.length) {
          out.push({
            id: item.id,
            label: item.label(t),
            items: item.items,
            priority: item.priority ?? 1,
          })
        }
      } else if (item.type === 'separator') {
        flush()
      } else {
        loose.push(item)
      }
    }
    flush()
    return out
  }

  /** Builds the controls. Only `createElement`/`textContent`/SVG nodes: no markup strings. */
  private render(): void {
    if (!this.isConnected) return
    this.closeMenus()
    while (this.firstChild) this.removeChild(this.firstChild)
    this.controls = []
    this.groups = []
    this.morePopup = null
    const doc = this.ownerDocument
    const t = this.translator
    this.setAttribute('aria-label', this.label ?? t('toolbar.label'))
    if (this.view) this.setAttribute('aria-controls', this.view.dom.id || this.ensureEditorId())
    const items = this._items ?? (this.view ? defaultToolbarItems(this.view.state.schema) : [])

    for (const group of this.groupItems(items)) {
      const groupEl = doc.createElement('div')
      groupEl.className = 'scriba-toolbar-group'
      groupEl.dataset['group'] = group.id
      groupEl.setAttribute('role', 'group')
      if (group.label) groupEl.setAttribute('aria-label', group.label)
      this.appendChild(groupEl)
      this.groups.push(groupEl)
      for (const item of group.items) {
        this.controls.push(
          this.renderControl(item, groupEl, item.priority ?? group.priority, this.controls.length),
        )
      }
    }

    // "More options": receives the groups that do not fit.
    const more = doc.createElement('button')
    more.type = 'button'
    more.className = 'scriba-toolbar-button scriba-toolbar-more'
    more.setAttribute('aria-label', t('toolbar.more'))
    more.title = t('toolbar.more')
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.appendChild(createIcon(doc, 'more'))
    more.tabIndex = -1
    more.hidden = true
    more.addEventListener('mousedown', (e) => e.preventDefault())
    more.addEventListener('click', () => this.toggleMore())
    more.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !this.morePopup?.isOpen) {
        e.preventDefault()
        e.stopPropagation()
        this.toggleMore()
      }
    })
    this.appendChild(more)
    this.moreButton = more

    this.updateState()
    this.layout()
  }

  private renderControl(
    item: ToolbarControl,
    groupEl: HTMLElement,
    priority: number,
    order: number,
  ): Rendered {
    const doc = this.ownerDocument
    const t = this.translator
    const el = doc.createElement('button')
    el.type = 'button'
    el.className = 'scriba-toolbar-button'
    el.dataset['item'] = item.id
    el.tabIndex = -1
    const label = item.label(t)
    el.setAttribute('aria-label', label)
    const shortcut = item.type === 'button' ? item.shortcut : undefined
    el.title = shortcut
      ? t('shortcut.hint', { label, shortcut: formatShortcut(shortcut, t, this.mac) })
      : label
    if (shortcut) el.setAttribute('aria-keyshortcuts', ariaShortcut(shortcut, this.mac))
    if (item.icon) el.appendChild(createIcon(doc, item.icon))
    if (item.text) {
      const glyph = doc.createElement('span')
      glyph.className = 'scriba-toolbar-glyph'
      glyph.setAttribute('aria-hidden', 'true')
      glyph.textContent = item.text
      el.appendChild(glyph)
    }
    // Keep the editor's selection when the control is pressed with the mouse.
    el.addEventListener('mousedown', (e) => e.preventDefault())
    groupEl.appendChild(el)
    const rendered: Rendered = { el, item, group: groupEl, priority, order }

    if (item.type === 'menu') {
      if (item.valueLabel) {
        el.classList.add('scriba-toolbar-select')
        const value = doc.createElement('span')
        value.className = 'scriba-toolbar-value'
        value.setAttribute('aria-hidden', 'true')
        el.appendChild(value)
        rendered.value = value
      }
      if (item.indicator) {
        const bar = doc.createElement('span')
        bar.className = 'scriba-toolbar-indicator'
        bar.setAttribute('aria-hidden', 'true')
        el.appendChild(bar)
        rendered.indicator = bar
      }
      el.appendChild(createIcon(doc, 'chevronDown', 14))
      const popup = new MenuPopup(item, el, t, () => this.view, this.mac)
      el.addEventListener('click', () => this.toggleMenu(popup))
      el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && !popup.isOpen) {
          e.preventDefault()
          e.stopPropagation()
          this.toggleMenu(popup)
        }
      })
      this.appendChild(popup.el)
      rendered.popup = popup
    } else {
      el.addEventListener('click', () => this.run(item, el))
    }
    return rendered
  }

  /** Refreshes pressed/disabled/visible state and current values from the editor state. */
  updateState(): void {
    const view = this.view
    const state = view?.state
    const t = this.translator
    let visibilityChanged = false
    for (const c of this.controls) {
      const { el, item } = c
      const hidden = !!state && !!item.isVisible && !item.isVisible(state)
      if (hidden !== el.hidden) {
        el.hidden = hidden
        visibilityChanged = true
      }
      let enabled: boolean
      if (item.type === 'menu') {
        enabled = !!state && item.entries.some((e) => controlUsable(view!, e) && e.command(state))
        if (c.value) {
          const value = state && item.valueLabel ? item.valueLabel(state, t) : ''
          if (c.value.textContent !== value) c.value.textContent = value
          setAttr(el, 'aria-label', value ? `${item.label(t)}: ${value}` : item.label(t))
        }
        if (c.indicator) {
          const raw = state && item.indicator ? item.indicator(state) : null
          const color = raw ? normalizeColor(raw) : null
          const background = color ?? 'transparent'
          if (c.indicator.dataset['color'] !== background) {
            c.indicator.dataset['color'] = background
            c.indicator.style.backgroundColor = background // CSSOM, validated color
            c.indicator.classList.toggle('scriba-toolbar-indicator-empty', !color)
          }
        }
      } else {
        enabled =
          !!state && controlUsable(view!, item) && (item.command(state) || !!item.isActive?.(state))
        if (item.isActive) setAttr(el, 'aria-pressed', String(!!state && item.isActive(state)))
      }
      setAttr(el, 'aria-disabled', String(!enabled))
    }
    this.updateGroups()
    // Measuring is costly: re-layout only when controls appeared or disappeared.
    if (visibilityChanged) this.layout()
    else this.updateTabStops()
  }

  /** Hides groups whose controls are all hidden or moved to "More options". */
  private updateGroups(): void {
    for (const group of this.groups) {
      const shown = this.controls.some((c) => c.group === group && !c.el.hidden && !overflowed(c))
      group.classList.toggle('scriba-toolbar-group-empty', !shown)
    }
  }

  /**
   * When the controls do not fit on one line, moves them into "More options",
   * lowest priority first (rightmost first among equals), until the rest fits.
   */
  layout(): void {
    const more = this.moreButton
    if (!more) return
    for (const c of this.controls) c.el.classList.remove(OVERFLOW)
    more.hidden = true
    this.updateGroups()
    if (this.clientWidth && this.scrollWidth > this.clientWidth) {
      more.hidden = false
      const queue = this.controls
        .filter((c) => !c.el.hidden)
        .sort((a, b) => a.priority - b.priority || b.order - a.order)
      for (const c of queue) {
        if (this.scrollWidth <= this.clientWidth) break
        c.el.classList.add(OVERFLOW)
        this.updateGroups()
      }
    }
    this.updateTabStops()
  }

  /** Controls reachable with the arrow keys (visible, not moved to the overflow menu). */
  private navigable(): HTMLButtonElement[] {
    const out = this.controls.filter((c) => !c.el.hidden && !overflowed(c)).map((c) => c.el)
    if (this.moreButton && !this.moreButton.hidden) out.push(this.moreButton)
    return out
  }

  private updateTabStops(): void {
    const nav = this.navigable()
    this.focusIndex = Math.min(this.focusIndex, Math.max(0, nav.length - 1))
    const current = nav[this.focusIndex]
    // only the changes (this runs on every keystroke)
    for (const c of this.controls) {
      const index = c.el === current ? 0 : -1
      if (c.el.tabIndex !== index) c.el.tabIndex = index
    }
    if (this.moreButton) {
      const index = this.moreButton === current ? 0 : -1
      if (this.moreButton.tabIndex !== index) this.moreButton.tabIndex = index
    }
  }

  private closeMenus(except?: MenuPopup): void {
    for (const c of this.controls) if (c.popup && c.popup !== except) c.popup.close(false)
    if (this.morePopup && this.morePopup !== except) this.morePopup.close(false)
  }

  private toggleMenu(popup: MenuPopup, anchor?: HTMLElement): void {
    if (!anchor && popup.button.getAttribute('aria-disabled') === 'true') return
    this.closeMenus(popup)
    if (popup.isOpen) popup.close(true)
    else popup.open(anchor)
  }

  /** Builds and opens the "More options" menu from the overflowed controls. */
  private toggleMore(): void {
    const more = this.moreButton!
    if (this.morePopup?.isOpen) {
      this.morePopup.close(true)
      return
    }
    this.closeMenus()
    this.morePopup?.el.remove()
    const t = this.translator
    const entries: PopupEntry[] = []
    for (const c of this.controls) {
      if (c.el.hidden || !overflowed(c)) continue
      const item = c.item
      if (item.type === 'menu') {
        const popup = c.popup!
        entries.push({
          id: item.id,
          label: item.label,
          ...(item.icon ? { icon: item.icon } : {}),
          command: (state) => item.entries.some((e) => e.command(state)),
          hasPopup: true,
          run: () => this.toggleMenu(popup, more),
        })
      } else {
        entries.push({
          id: item.id,
          label: item.label,
          ...(item.icon ? { icon: item.icon } : {}),
          ...(item.shortcut ? { shortcut: item.shortcut } : {}),
          ...(item.isActive ? { isActive: item.isActive, toggle: true } : {}),
          command: item.command,
          ...(item.run ? { run: item.run } : {}),
          ...(item.readOnly ? { readOnly: true } : {}),
          ...(item.annotates ? { annotates: true } : {}),
        })
      }
    }
    this.morePopup = new MenuPopup(
      { label: () => t('toolbar.more'), entries },
      more,
      t,
      () => this.view,
      this.mac,
    )
    this.appendChild(this.morePopup.el)
    this.morePopup.open()
  }

  private run(item: ToolbarButton, el: HTMLButtonElement): void {
    const view = this.view
    if (!view || el.getAttribute('aria-disabled') === 'true') return
    if (item.run) {
      item.run(view)
      return
    }
    item.command(view.state, (tr) => transactionAllowed(view, tr) && view.dispatch(tr), view)
    // Mouse users go back to typing; keyboard users stay in the toolbar.
    if (this.ownerDocument.activeElement !== el) view.focus()
  }

  private moveFocus(index: number): void {
    const nav = this.navigable()
    if (!nav.length) return
    this.focusIndex = (index + nav.length) % nav.length
    this.updateTabStops()
    nav[this.focusIndex]!.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(this.focusIndex + 1),
      ArrowDown: () => this.moveFocus(this.focusIndex + 1),
      ArrowLeft: () => this.moveFocus(this.focusIndex - 1),
      ArrowUp: () => this.moveFocus(this.focusIndex - 1),
      Home: () => this.moveFocus(0),
      End: () => this.moveFocus(this.navigable().length - 1),
      Escape: () => this.view?.focus(),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  private onFocusIn = (event: FocusEvent): void => {
    const index = this.navigable().indexOf(event.target as HTMLButtonElement)
    if (index >= 0 && index !== this.focusIndex) {
      this.focusIndex = index
      this.updateTabStops()
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

/**
 * Sets an attribute only when it changes: the toolbar updates on every keystroke, and
 * rewriting an attribute (even with the same value) makes the browser recompute styles.
 */
function setAttr(el: HTMLElement, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
