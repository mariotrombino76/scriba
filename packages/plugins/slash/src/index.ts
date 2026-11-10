import {
  setBlockType,
  type Command,
  type KeyBindings,
  type Plugin,
  type Schema,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { EditorView } from '@scriba-editor/view'
import {
  chooseItem,
  closeSlash,
  filterItems,
  getSlashState,
  slashKey,
  slashPlugin,
  type SlashItem,
} from './state.js'

export {
  slashKey,
  getSlashState,
  filterItems,
  chooseItem,
  fold,
  type SlashItem,
  type SlashState,
} from './state.js'

/** The "/" menu with `items` (see `basicSlashItems` and the plugins' commands). */
export function slashCommands(items: readonly SlashItem[], t: Translate): Plugin[] {
  return [slashPlugin(items, t)]
}

/**
 * Keys while the menu is open (use a high priority): arrows move, Enter or
 * Tab choose, Escape closes it (the typed text stays). A space after a query
 * matching nothing (or right after the "/") closes it, so normal typing goes on.
 */
export function slashKeymap(items: readonly SlashItem[], t: Translate): KeyBindings {
  const shown = (state: Parameters<Command>[0]) => {
    const s = getSlashState(state)
    return s.active ? filterItems(items, s.query, t) : null
  }
  const move =
    (dir: 1 | -1): Command =>
    (state, dispatch) => {
      const list = shown(state)
      if (!list?.length) return false
      const s = getSlashState(state)
      const index = (Math.min(s.index, list.length - 1) + dir + list.length) % list.length
      dispatch?.(state.tr.setMeta(slashKey, { ...s, index }))
      return true
    }
  const choose: Command = (state, dispatch, view) => {
    const list = shown(state)
    if (!list?.length || !view) return false
    if (dispatch)
      chooseItem(view as EditorView, list[Math.min(getSlashState(state).index, list.length - 1)]!)
    return true
  }
  const close: Command = (state, dispatch) => {
    if (!getSlashState(state).active) return false
    dispatch?.(closeSlash(state.tr))
    return true
  }
  /** Space with a query matching nothing (or right after "/"): close, the space is typed normally. */
  const space: Command = (state, dispatch) => {
    const s = getSlashState(state)
    if (!s.active || (s.query && shown(state)?.length)) return false
    dispatch?.(closeSlash(state.tr))
    return false
  }
  return {
    ArrowDown: move(1),
    ArrowUp: move(-1),
    Enter: choose,
    Tab: choose,
    Escape: close,
    ' ': space,
  }
}

/** Paragraph and headings 1–3 (for the schema's paragraph/heading types). */
export function basicSlashItems(schema: Schema): SlashItem[] {
  const items: SlashItem[] = []
  const p = schema.nodes['paragraph']
  const h = schema.nodes['heading']
  if (p)
    items.push({
      id: 'paragraph',
      label: (t) => t('block.paragraph'),
      keywords: ['testo', 'text', 'p'],
      command: setBlockType(p),
    })
  if (h)
    for (const level of [1, 2, 3])
      items.push({
        id: `heading${level}`,
        label: (t) => t('block.heading', { level }),
        keywords: [`h${level}`, 'titolo', 'heading', 'title'],
        command: setBlockType(h, { level }),
      })
  return items
}
