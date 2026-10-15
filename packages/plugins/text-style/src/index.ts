import {
  chainCommands,
  type Command,
  type KeyBindings,
  type MarkType,
  type Schema,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type {
  IconName,
  ToolbarButton,
  ToolbarItem,
  ToolbarMenu,
  ToolbarMenuEntry,
} from '@scriba/ui'
import { changeIndent, isAligned, setTextAlign, type TextAlign } from './blocks.js'
import { markValue, setMarkValue } from './marks.js'

export * from './blocks.js'
export * from './marks.js'

type MessageKey = Parameters<Translate>[0]

export interface ColorOption {
  /** i18n key of the accessible name, e.g. `'color.name.red'`. */
  name: MessageKey
  value: string
}

export interface TextStyleOptions {
  /** Text colors (≥ 4.5:1 on white by default). */
  textColors?: ColorOption[]
  /** Highlight colors (light, for dark text). */
  backgroundColors?: ColorOption[]
  /** Font families offered in the menu (any valid family is kept when pasted). */
  fontFamilies?: { label: string; value: string }[]
  /** Font sizes offered in the menu. */
  fontSizes?: string[]
  /**
   * Commands tried before block indentation, e.g. list item nesting
   * (`listIndentCommands(schema)`): one pair of indent buttons/keys for everything.
   */
  indent?: { more?: Command; less?: Command }
}

export const defaultTextColors: ColorOption[] = [
  { name: 'color.name.black', value: '#000000' },
  { name: 'color.name.gray', value: '#4b5563' },
  { name: 'color.name.red', value: '#b91c1c' },
  { name: 'color.name.orange', value: '#c2410c' },
  { name: 'color.name.yellow', value: '#a16207' },
  { name: 'color.name.green', value: '#15803d' },
  { name: 'color.name.teal', value: '#0f766e' },
  { name: 'color.name.blue', value: '#1d4ed8' },
  { name: 'color.name.purple', value: '#7e22ce' },
  { name: 'color.name.pink', value: '#be185d' },
]

export const defaultBackgroundColors: ColorOption[] = [
  { name: 'color.name.yellow', value: '#fef08a' },
  { name: 'color.name.green', value: '#bbf7d0' },
  { name: 'color.name.teal', value: '#99f6e4' },
  { name: 'color.name.blue', value: '#bfdbfe' },
  { name: 'color.name.purple', value: '#e9d5ff' },
  { name: 'color.name.pink', value: '#fbcfe8' },
  { name: 'color.name.red', value: '#fecaca' },
  { name: 'color.name.orange', value: '#fed7aa' },
  { name: 'color.name.gray', value: '#e5e7eb' },
]

export const defaultFontFamilies = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
]

export const defaultFontSizes = ['10pt', '12pt', '14pt', '18pt', '24pt', '36pt']

/**
 * Keys (Google Docs / TinyMCE style): Shift+Mod+L/E/R/J alignment,
 * Mod+] / Mod+[ indentation.
 */
export function textStyleKeymap(options: Pick<TextStyleOptions, 'indent'> = {}): KeyBindings {
  const { more, less } = indentCommands(options)
  return {
    'Shift-Mod-l': setTextAlign('left'),
    'Shift-Mod-e': setTextAlign('center'),
    'Shift-Mod-r': setTextAlign('right'),
    'Shift-Mod-j': setTextAlign('justify'),
    'Mod-]': more,
    'Mod-[': less,
  }
}

function indentCommands(options: Pick<TextStyleOptions, 'indent'>): {
  more: Command
  less: Command
} {
  const more = options.indent?.more
  const less = options.indent?.less
  return {
    more: more ? chainCommands(more, changeIndent(1)) : changeIndent(1),
    less: less ? chainCommands(less, changeIndent(-1)) : changeIndent(-1),
  }
}

const ALIGNMENTS: { value: TextAlign; icon: IconName; key: MessageKey; shortcut: string }[] = [
  { value: 'left', icon: 'alignLeft', key: 'align.left', shortcut: 'Shift-Mod-l' },
  { value: 'center', icon: 'alignCenter', key: 'align.center', shortcut: 'Shift-Mod-e' },
  { value: 'right', icon: 'alignRight', key: 'align.right', shortcut: 'Shift-Mod-r' },
  { value: 'justify', icon: 'alignJustify', key: 'align.justify', shortcut: 'Shift-Mod-j' },
]

/** One "Alignment" menu (icon, name and shortcut per entry). */
export function alignmentMenu(): ToolbarMenu {
  return {
    type: 'menu',
    id: 'align',
    icon: 'alignLeft',
    label: (t) => t('align.menu'),
    entries: ALIGNMENTS.map((a) => ({
      id: `align-${a.value}`,
      icon: a.icon,
      label: (t) => t(a.key),
      shortcut: a.shortcut,
      command: setTextAlign(a.value),
      isActive: (state) => isAligned(state, a.value),
    })),
  }
}

/** Decrease / increase indentation (combined with list nesting when `options.indent` is set). */
export function indentItems(options: Pick<TextStyleOptions, 'indent'> = {}): ToolbarButton[] {
  const indent = indentCommands(options)
  return [
    {
      type: 'button',
      id: 'indent-less',
      icon: 'outdent',
      label: (t) => t('indent.less'),
      shortcut: 'Mod-[',
      command: indent.less,
    },
    {
      type: 'button',
      id: 'indent-more',
      icon: 'indent',
      label: (t) => t('indent.more'),
      shortcut: 'Mod-]',
      command: indent.more,
    },
  ]
}

function colorMenu(
  id: string,
  label: MessageKey,
  look: { icon?: IconName; text?: string },
  type: MarkType,
  colors: ColorOption[],
): ToolbarMenu {
  return {
    type: 'menu',
    id,
    ...look,
    label: (t) => t(label),
    layout: 'grid',
    indicator: (state) => (markValue(state, type, 'color') as string | null) ?? null,
    entries: [
      ...colors.map((c): ToolbarMenuEntry => ({
        id: c.value,
        label: (t) => t(c.name),
        swatch: c.value,
        command: setMarkValue(type, { color: c.value }),
        isActive: (state) => markValue(state, type, 'color') === c.value,
      })),
      {
        id: 'none',
        icon: 'close',
        label: (t) => t('color.remove'),
        command: setMarkValue(type, null),
      },
    ],
  }
}

/** Text color and highlight menus (color grid, current color shown under the icon). */
export function colorItems(schema: Schema, options: TextStyleOptions = {}): ToolbarMenu[] {
  const { text_color, background_color } = schema.marks
  const items: ToolbarMenu[] = []
  if (text_color) {
    items.push(
      colorMenu(
        'text-color',
        'color.text',
        { text: 'A' },
        text_color,
        options.textColors ?? defaultTextColors,
      ),
    )
  }
  if (background_color) {
    items.push(
      colorMenu(
        'background-color',
        'color.background',
        { icon: 'highlight' },
        background_color,
        options.backgroundColors ?? defaultBackgroundColors,
      ),
    )
  }
  return items
}

/** Font family and size menus, showing the current value like a select. */
export function fontItems(schema: Schema, options: TextStyleOptions = {}): ToolbarMenu[] {
  const { font_family, font_size } = schema.marks
  const items: ToolbarMenu[] = []
  if (font_family) {
    const families = options.fontFamilies ?? defaultFontFamilies
    items.push({
      type: 'menu',
      id: 'font-family',
      label: (t) => t('font.family'),
      valueLabel: (state, t) => {
        const value = markValue(state, font_family, 'family')
        return (
          families.find((f) => f.value === value)?.label ??
          (value ? String(value) : t('font.default'))
        )
      },
      entries: [
        {
          id: 'default',
          label: (t) => t('font.default'),
          command: setMarkValue(font_family, null),
        },
        ...families.map((f): ToolbarMenuEntry => ({
          id: f.value,
          label: () => f.label,
          command: setMarkValue(font_family, { family: f.value }),
          isActive: (state) => markValue(state, font_family, 'family') === f.value,
        })),
      ],
    })
  }
  if (font_size) {
    items.push({
      type: 'menu',
      id: 'font-size',
      label: (t) => t('font.size'),
      valueLabel: (state, t) =>
        (markValue(state, font_size, 'size') as string | null) ?? t('font.sizeAuto'),
      entries: [
        { id: 'default', label: (t) => t('font.default'), command: setMarkValue(font_size, null) },
        ...(options.fontSizes ?? defaultFontSizes).map((size): ToolbarMenuEntry => ({
          id: size,
          label: () => size,
          command: setMarkValue(font_size, { size }),
          isActive: (state) => markValue(state, font_size, 'size') === size,
        })),
      ],
    })
  }
  return items
}

/** All text-style controls, flat (compose them into groups with `toolbarGroup`). */
export function textStyleToolbarItems(
  schema: Schema,
  options: TextStyleOptions = {},
): ToolbarItem[] {
  return [
    alignmentMenu(),
    ...indentItems(options),
    ...colorItems(schema, options),
    ...fontItems(schema, options),
  ]
}
