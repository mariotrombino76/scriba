import type { Command, KeyBindings, Schema } from '@scriba-editor/core'
import type { MessageKey } from '@scriba-editor/i18n'
import type { ToolbarControl, ToolbarMenu } from '@scriba-editor/ui'
import {
  isInList,
  listAttr,
  liftListItem,
  setListStyle,
  liftListItemAtStart,
  sinkListItem,
  splitListItem,
  toggleList,
} from './commands.js'

export { listNodes, NUMBERINGS, type Numbering, type BulletStyle } from './nodes.js'
import { NUMBERINGS, type BulletStyle, type Numbering } from './nodes.js'
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
): ToolbarControl[] {
  const t = types(schema)
  const indent: ToolbarControl[] =
    options.indent === false
      ? []
      : [
          {
            type: 'button',
            id: 'list_sink',
            icon: 'indent',
            label: (tr) => tr('list.sink'),
            shortcut: 'Tab',
            command: sinkListItem(t.item),
          },
          {
            type: 'button',
            id: 'list_lift',
            icon: 'outdent',
            label: (tr) => tr('list.lift'),
            shortcut: 'Shift-Tab',
            command: liftListItem(t.item),
          },
        ]
  return [
    {
      type: 'button',
      id: 'bullet_list',
      icon: 'bulletList',
      label: (tr) => tr('list.bullet'),
      shortcut: 'Shift-Mod-8',
      command: toggleList(t.bullet, t.item),
      isActive: (state) => isInList(state, t.bullet, t.item),
    },
    {
      type: 'button',
      id: 'ordered_list',
      icon: 'orderedList',
      label: (tr) => tr('list.ordered'),
      shortcut: 'Shift-Mod-7',
      command: toggleList(t.ordered, t.item),
      isActive: (state) => isInList(state, t.ordered, t.item),
    },
    ...indent,
  ]
}

const BULLETS: {
  value: BulletStyle | null
  key: 'list.style.disc' | 'list.style.circle' | 'list.style.square'
}[] = [
  { value: null, key: 'list.style.disc' },
  { value: 'circle', key: 'list.style.circle' },
  { value: 'square', key: 'list.style.square' },
]
const NUMBERING_KEYS: Record<Numbering, MessageKey> = {
  '1': 'list.style.decimal',
  a: 'list.style.lowerAlpha',
  A: 'list.style.upperAlpha',
  i: 'list.style.lowerRoman',
  I: 'list.style.upperRoman',
}

/**
 * List style menus (like TinyMCE's advlist): bullet shape of bulleted lists and
 * numbering of numbered ones. In a list of that kind they change it; elsewhere
 * they start a list with that style.
 */
export function listStyleMenus(schema: Schema): ToolbarMenu[] {
  const t = types(schema)
  return [
    {
      type: 'menu',
      id: 'bullet_style',
      icon: 'bulletList',
      label: (tr) => tr('list.style.bulletMenu'),
      entries: BULLETS.map((b) => ({
        id: `bullet-${b.value ?? 'disc'}`,
        label: (tr) => tr(b.key),
        command: setListStyle(t.bullet, t.item, { bullet: b.value }),
        isActive: (state) => listAttr(state, t.bullet, t.item, 'bullet') === b.value,
      })),
    },
    {
      type: 'menu',
      id: 'numbering_style',
      icon: 'orderedList',
      label: (tr) => tr('list.style.numberMenu'),
      entries: NUMBERINGS.map((n) => {
        const value = n === '1' ? null : n
        return {
          id: `numbering-${n}`,
          label: (tr) => tr(NUMBERING_KEYS[n]),
          command: setListStyle(t.ordered, t.item, { numbering: value }),
          isActive: (state) => listAttr(state, t.ordered, t.item, 'numbering') === value,
        }
      }),
    },
  ]
}
