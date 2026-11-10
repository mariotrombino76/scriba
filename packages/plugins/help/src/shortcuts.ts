import type { Translate } from '@scriba-editor/i18n'
import type { MenuItem, ToolbarItem } from '@scriba-editor/ui'

/** One line of the help: an action and how to do it from the keyboard. */
export interface HelpShortcut {
  /** Key bindings like `"Mod-b"` (alternatives), shown in the platform's notation. */
  keys?: readonly string[]
  /** Or what to type (`"# "`, `"**text**"`), shown as is. */
  typed?: (t: Translate) => string
  label: (t: Translate) => string
}

/** A titled group of shortcuts (one table in the dialog). */
export interface HelpGroup {
  id: string
  title: (t: Translate) => string
  shortcuts: HelpShortcut[]
}

/**
 * The shortcuts of toolbar and menu bar items, with the items' own labels
 * (bold, undo, heading 2…): the list stays in step with the buttons. Each key
 * binding is listed once, at its first appearance.
 */
export function shortcutsFromItems(items: readonly (ToolbarItem | MenuItem)[]): HelpGroup {
  const shortcuts: HelpShortcut[] = []
  const seen = new Set<string>()
  const add = (shortcut: string | undefined, label: (t: Translate) => string) => {
    if (!shortcut || seen.has(shortcut)) return
    seen.add(shortcut)
    shortcuts.push({ keys: [shortcut], label })
  }
  const walk = (list: readonly (ToolbarItem | MenuItem)[]) => {
    for (const item of list) {
      if (item === '|') continue
      if (!('type' in item)) {
        add(item.shortcut, item.label) // a menu entry used as an item
        continue
      }
      if (item.type === 'group') walk(item.items)
      else if (item.type === 'button') add(item.shortcut, item.label)
      else if (item.type === 'menu') for (const e of item.entries) add(e.shortcut, e.label)
    }
  }
  walk(items)
  return { id: 'commands', title: (t) => t('help.group.commands'), shortcuts }
}

/** Writing keys that have no button: line break, plain paste, Tab; "/" and "@" when used. */
export function editingHelp(options: { slash?: boolean; mentions?: boolean } = {}): HelpGroup {
  const shortcuts: HelpShortcut[] = [
    { keys: ['Shift-Enter'], label: (t) => t('help.hardBreak') },
    { keys: ['Mod-Shift-v'], label: (t) => t('help.plainPaste') },
    { keys: ['Tab'], label: (t) => t('help.nextCell') },
    { keys: ['Shift-Tab'], label: (t) => t('help.prevCell') },
  ]
  if (options.slash) shortcuts.push({ typed: () => '/', label: (t) => t('help.slash') })
  if (options.mentions) shortcuts.push({ typed: () => '@', label: (t) => t('help.mention') })
  return { id: 'editing', title: (t) => t('help.group.editing'), shortcuts }
}

/** The Markdown typing shortcuts of `@scriba-editor/plugin-markdown`. */
export function markdownHelp(): HelpGroup {
  const around = (d: string) => (t: Translate) => `${d}${t('help.sample')}${d}`
  return {
    id: 'markdown',
    title: (t) => t('help.group.markdown'),
    shortcuts: [
      { typed: () => '# ', label: (t) => t('help.md.heading') },
      { typed: () => '- ', label: (t) => t('list.bullet') },
      { typed: () => '1. ', label: (t) => t('list.ordered') },
      { typed: () => '> ', label: (t) => t('block.blockquote') },
      { typed: () => '``` ', label: (t) => t('help.md.code') },
      { typed: around('**'), label: (t) => t('mark.bold') },
      { typed: around('*'), label: (t) => t('mark.italic') },
      { typed: around('~~'), label: (t) => t('mark.strike') },
      { typed: around('`'), label: (t) => t('mark.code') },
      { typed: (t) => `[${t('help.sample')}](https://…)`, label: (t) => t('help.md.link') },
      { keys: ['Backspace'], label: (t) => t('help.undoRule') },
    ],
  }
}

/** Moving around: menus, dialogs, the selection bar and the context menu when used. */
export function navigationHelp(
  options: { bubble?: boolean; contextMenu?: boolean } = {},
): HelpGroup {
  const shortcuts: HelpShortcut[] = [
    { typed: () => '← ↑ → ↓', label: (t) => t('help.nav.arrows') },
    { keys: ['Escape'], label: (t) => t('help.nav.escape') },
  ]
  if (options.bubble) shortcuts.push({ keys: ['Alt-F10'], label: (t) => t('help.nav.bubble') })
  if (options.contextMenu)
    shortcuts.push({ keys: ['Shift-F10'], label: (t) => t('help.nav.context') })
  return { id: 'navigation', title: (t) => t('help.group.navigation'), shortcuts }
}
