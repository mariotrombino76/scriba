import type { Translate } from '@scriba-editor/i18n'
import { createIcon } from '@scriba-editor/ui'
import type { EditorView, PluginView } from '@scriba-editor/view'
import { chooseItem, filterItems, getSlashState, type SlashItem } from './state.js'

let ids = 0

/**
 * The slash menu: a listbox under the "/", while the focus stays in the text.
 * The editor points to it (`aria-controls`, `aria-activedescendant`), so
 * screen readers announce the highlighted entry as the user types or moves.
 */
export function slashMenuView(
  view: EditorView,
  items: readonly SlashItem[],
  t: Translate,
): PluginView {
  const doc = view.document
  const id = `scriba-slash-${++ids}`
  const menu = doc.createElement('div')
  menu.className = 'scriba-slash-menu'
  menu.id = id
  menu.setAttribute('role', 'listbox')
  menu.setAttribute('aria-label', t('slash.label'))
  menu.hidden = true
  doc.body.appendChild(menu)

  const hide = () => {
    if (menu.hidden) return
    menu.hidden = true
    view.dom.removeAttribute('aria-controls')
    view.dom.removeAttribute('aria-activedescendant')
  }

  const update = () => {
    const s = getSlashState(view.state)
    if (!s.active || !view.hasFocus()) return hide()
    const shown = filterItems(items, s.query, t)
    menu.replaceChildren()
    if (!shown.length) {
      const empty = doc.createElement('div')
      empty.className = 'scriba-slash-empty'
      empty.textContent = t('slash.none')
      menu.appendChild(empty)
      view.dom.removeAttribute('aria-activedescendant')
    }
    const index = Math.min(s.index, shown.length - 1)
    shown.forEach((item, i) => {
      const option = doc.createElement('div')
      option.className = 'scriba-slash-item'
      option.id = `${id}-${item.id}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(i === index))
      if (item.icon) option.appendChild(createIcon(doc, item.icon, 16))
      const label = doc.createElement('span')
      label.textContent = item.label(t)
      option.appendChild(label)
      // keep the focus (and the "/query") in the editor while clicking
      option.addEventListener('mousedown', (e) => e.preventDefault())
      option.addEventListener('click', () => chooseItem(view, item))
      menu.appendChild(option)
      if (i === index) {
        view.dom.setAttribute('aria-activedescendant', option.id)
        option.scrollIntoView?.({ block: 'nearest' }) // (missing outside browsers)
      }
    })
    view.dom.setAttribute('aria-controls', id)
    menu.hidden = false
    // under the "/" (above it when there is no room below), inside the window
    const at = view.coordsAtPos(s.from)
    const win = doc.defaultView
    const vh = win?.innerHeight ?? 0
    const vw = win?.innerWidth ?? 0
    const h = menu.offsetHeight
    const w = menu.offsetWidth
    let top = at.bottom + 4
    if (vh && top + h > vh - 8 && at.top - h - 4 > 8) top = at.top - h - 4
    menu.style.top = `${Math.round(top)}px` // CSSOM (strict CSP)
    menu.style.left = `${Math.round(Math.max(8, Math.min(at.left, vw - w - 8)))}px`
  }

  const onBlur = () => setTimeout(() => !view.hasFocus() && hide(), 0)
  view.dom.addEventListener('blur', onBlur)
  update()
  return {
    update,
    destroy() {
      view.dom.removeEventListener('blur', onBlur)
      hide()
      menu.remove()
    },
  }
}
