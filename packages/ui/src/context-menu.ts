import { NodeSelection, Selection, type EditorState } from '@scriba-editor/core'
import { createTranslator, type Translate } from '@scriba-editor/i18n'
import type { EditorView } from '@scriba-editor/view'
import type { ToolbarMenu } from './items.js'
import { MenuPopup, type PopupEntry } from './menu.js'
import { isControl, popupEntries, type MenuItem } from './popup-entries.js'
import { isMac } from './shortcut.js'

/** A part of the context menu, shown when it applies where the menu opens (a link, an image, a table…). */
export interface ContextMenuSection {
  id: string
  /** Whether the section applies, after the right click moved the cursor there. */
  isVisible: (state: EditorState) => boolean
  items: MenuItem[]
}

export interface ContextMenuOptions {
  /** In order; the visible ones are shown one after the other, separated. */
  sections: ContextMenuSection[]
  translator?: Translate
  mac?: boolean
}

export interface ContextMenu {
  /** Opens at a viewport point if a section applies; returns whether it opened. */
  open(x: number, y: number): boolean
  close(): void
  readonly isOpen: boolean
  destroy(): void
}

/**
 * Right-click menu of the editor, like TinyMCE's `contextmenu`: the sections
 * that apply where you click (link, image, table…) as one menu, with toolbar
 * menus as sub-menus. Where none applies — and with Ctrl (Cmd on macOS) held —
 * the browser's own menu opens (spelling suggestions, paste…). On touch
 * screens a long press opens it only on an image or another element; on
 * text the system menu (select, copy, paste) is kept. The menu key
 * and Shift+F10 open it at the cursor. Entries are enabled exactly as in the
 * toolbar (read-only, commenting…).
 */
export function contextMenu(view: EditorView, options: ContextMenuOptions): ContextMenu {
  const t = options.translator ?? createTranslator(view.document.documentElement.lang || 'en')
  const mac = options.mac ?? isMac()
  const owner = view.dom
  const host = owner.parentElement ?? view.document.body
  let current: MenuPopup | null = null
  let point: [number, number] = [0, 0]

  const show = (
    label: (t: Translate) => string,
    entries: PopupEntry[],
    back?: () => void,
  ): MenuPopup => {
    current?.close(false)
    current?.el.remove()
    const popup = new MenuPopup(
      { label, entries },
      owner,
      t,
      () => view,
      mac,
      // Right on an entry with a sub-menu opens it; Left in a sub-menu goes back
      (dir) => dir < 0 && back?.(),
    )
    popup.el.classList.add('scriba-context-menu')
    host.appendChild(popup.el)
    popup.openAt(point[0], point[1], owner)
    current = popup
    return popup
  }

  const visibleItems = (items: readonly MenuItem[], state: EditorState): MenuItem[] =>
    items.filter((i) => i === '|' || !isControl(i) || !i.isVisible || i.isVisible(state))

  const openMain = (): boolean => {
    const state = view.state
    const items: MenuItem[] = []
    for (const section of options.sections) {
      if (!section.isVisible(state)) continue
      const own = visibleItems(section.items, state)
      if (!own.some((i) => i !== '|')) continue
      if (items.length) items.push('|')
      items.push(...own)
    }
    if (!items.length) return false
    const openSub = (menu: ToolbarMenu): void => {
      show(menu.label, menu.entries, openMain)
    }
    show((tr) => tr('contextmenu.label'), popupEntries(items, openSub))
    return true
  }

  /** The atom (image, embed, formula…) under the pointer, if the event is on one. */
  const atomAt = (event: MouseEvent, pos: number): number | null => {
    const { doc } = view.state
    const target = event.target instanceof Element ? event.target : null
    if (!target) return null
    for (const at of [pos, pos - 1]) {
      const node = at >= 0 ? doc.nodeAt(at) : null
      const dom = node && !node.isText && NodeSelection.isSelectable(node) ? view.nodeDOM(at) : null
      if (node?.isAtom && dom?.contains(target)) return at
    }
    return null
  }

  /** A right click outside the selection moves the cursor there first (an image gets selected). */
  const moveSelection = (event: MouseEvent, pos: number): void => {
    const { state } = view
    const atom = atomAt(event, pos)
    let selection: Selection | null = atom === null ? null : NodeSelection.create(state.doc, atom)
    const { from, to, empty } = state.selection
    if (!selection && !empty && from <= pos && pos <= to) return // inside the selection: keep it
    selection ??= Selection.near(state.doc.resolve(pos))
    if (!selection.eq(state.selection)) view.dispatch(state.tr.setSelection(selection))
  }

  const onContextMenu = (event: MouseEvent): void => {
    if (mac ? event.metaKey : event.ctrlKey) return // the browser's own menu
    if (view.eventInNodeView(event)) return
    // keyboard (menu key, Shift+F10): no pointer position, open at the cursor
    // (a PointerEvent with no pointer type; older browsers: not the right button)
    const pointerType = (event as Partial<PointerEvent>).pointerType
    const keyboard =
      pointerType !== undefined ? pointerType === '' : event.button !== 2 && !event.ctrlKey
    if (keyboard) {
      const box = view.coordsAtPos(view.state.selection.head)
      point = [box.left, box.bottom + 4]
    } else {
      const pos = view.posAtCoords(event.clientX, event.clientY)
      // a long press on text (touch screens) keeps the system menu: select, copy, paste
      if (pointerType === 'touch' && (pos === null || atomAt(event, pos) === null)) return
      if (pos !== null) moveSelection(event, pos)
      point = [event.clientX, event.clientY]
    }
    if (openMain()) event.preventDefault()
  }

  owner.addEventListener('contextmenu', onContextMenu)
  return {
    open(x, y) {
      point = [x, y]
      return openMain()
    },
    close() {
      current?.close(false)
    },
    get isOpen() {
      return !!current?.isOpen
    },
    destroy() {
      owner.removeEventListener('contextmenu', onContextMenu)
      current?.close(false)
      current?.el.remove()
      current = null
    },
  }
}
