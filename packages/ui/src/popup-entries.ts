import type { ToolbarControl, ToolbarMenu, ToolbarMenuEntry } from './items.js'
import type { PopupEntry } from './menu.js'

/** An item of a menu bar menu or of the context menu; `'|'` separates groups. */
export type MenuItem = ToolbarControl | ToolbarMenuEntry | '|'

export const isControl = (x: ToolbarControl | ToolbarMenuEntry): x is ToolbarControl =>
  'type' in x && (x.type === 'button' || x.type === 'menu')

/** A toolbar control used as a plain action (a context menu entry): no pressed state. */
export function withoutPressed(item: ToolbarControl): ToolbarControl {
  if (item.type !== 'button' || !item.isActive) return item
  const action = { ...item }
  delete action.isActive
  return action
}

/**
 * Menu items as popup entries: toolbar buttons become entries (enabled exactly
 * as in the toolbar), toolbar menus become entries opening a sub-menu through
 * `openSubmenu`, `'|'` puts a separator before the next entry.
 */
export function popupEntries(
  items: readonly MenuItem[],
  openSubmenu: (menu: ToolbarMenu) => void,
): PopupEntry[] {
  const out: PopupEntry[] = []
  let separate = false
  for (const item of items) {
    if (item === '|') {
      separate = out.length > 0
      continue
    }
    out.push({ ...popupEntry(item, openSubmenu), ...(separate ? { separatorBefore: true } : {}) })
    separate = false
  }
  return out
}

function popupEntry(
  item: ToolbarControl | ToolbarMenuEntry,
  openSubmenu: (menu: ToolbarMenu) => void,
): PopupEntry {
  if (!isControl(item)) return item
  if (item.type === 'menu') {
    return {
      id: item.id,
      label: item.label,
      ...(item.icon ? { icon: item.icon } : {}),
      command: (state) => item.entries.some((e) => e.command(state)),
      hasPopup: true,
      run: () => openSubmenu(item),
    }
  }
  return {
    id: item.id,
    label: item.label,
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    ...(item.isActive ? { isActive: item.isActive, toggle: true } : {}),
    command: item.command,
    ...(item.run ? { run: item.run } : {}),
    ...(item.readOnly ? { readOnly: true } : {}),
    ...(item.annotates ? { annotates: true } : {}),
  }
}
