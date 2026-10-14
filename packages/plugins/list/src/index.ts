import type { Command, KeyBindings, Schema } from '@scriba/core'
import type { ToolbarItem } from '@scriba/ui'
import {
  isInList,
  liftListItem,
  liftListItemAtStart,
  sinkListItem,
  splitListItem,
  toggleList,
} from './commands.js'

export { listNodes } from './nodes.js'
export * from './commands.js'

function types(schema: Schema) {
  const { bullet_list, ordered_list, list_item } = schema.nodes
  if (!bullet_list || !ordered_list || !list_item) {
    throw new RangeError('The schema has no list nodes (add listNodes)')
  }
  return { bullet: bullet_list, ordered: ordered_list, item: list_item }
}

/**
 * List keys (use with a higher priority than the base keymap):
 * Enter new item, Tab / Shift+Tab indent, Backspace at item start outdents,
 * Shift+Mod+8 / Shift+Mod+7 bulleted / numbered list.
 */
export function listKeymap(schema: Schema): KeyBindings {
  const t = types(schema)
  return {
    Enter: splitListItem(t.item),
    Tab: sinkListItem(t.item),
    'Shift-Tab': liftListItem(t.item),
    Backspace: liftListItemAtStart(t.item),
    'Shift-Mod-8': toggleList(t.bullet, t.item),
    'Shift-Mod-7': toggleList(t.ordered, t.item),
  }
}

/**
 * Indent/outdent commands for list items. Combine them with block indentation
 * (e.g. `textStyleToolbarItems(schema, { indent: listIndentCommands(schema) })`)
 * to get a single pair of indent buttons, as in word processors.
 */
export function listIndentCommands(schema: Schema): { more: Command; less: Command } {
  const t = types(schema)
  return { more: sinkListItem(t.item), less: liftListItem(t.item) }
}

/**
 * Toolbar buttons: bulleted and numbered list, plus indent/outdent unless
 * `indent: false` (when another plugin provides the combined indent buttons).
 */
export function listToolbarItems(
  schema: Schema,
  options: { indent?: boolean } = {},
): ToolbarItem[] {
  const t = types(schema)
  const indent: ToolbarItem[] =
    options.indent === false
      ? []
      : [
          {
            type: 'button',
            id: 'list_sink',
            text: '→',
            label: (tr) => tr('list.sink'),
            shortcut: 'Tab',
            command: sinkListItem(t.item),
          },
          {
            type: 'button',
            id: 'list_lift',
            text: '←',
            label: (tr) => tr('list.lift'),
            shortcut: 'Shift-Tab',
            command: liftListItem(t.item),
          },
        ]
  return [
    {
      type: 'button',
      id: 'bullet_list',
      text: '•≡',
      label: (tr) => tr('list.bullet'),
      shortcut: 'Shift-Mod-8',
      command: toggleList(t.bullet, t.item),
      isActive: (state) => isInList(state, t.bullet, t.item),
    },
    {
      type: 'button',
      id: 'ordered_list',
      text: '1≡',
      label: (tr) => tr('list.ordered'),
      shortcut: 'Shift-Mod-7',
      command: toggleList(t.ordered, t.item),
      isActive: (state) => isInList(state, t.ordered, t.item),
    },
    ...indent,
  ]
}
