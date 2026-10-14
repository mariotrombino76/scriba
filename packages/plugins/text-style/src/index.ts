import { chainCommands, type Command, type KeyBindings, type Schema } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarItem, ToolbarMenuEntry } from '@scriba/ui'
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

/** Toolbar items: alignment buttons, indentation, color/highlight/font/size menus. */
export function textStyleToolbarItems(
  schema: Schema,
  options: TextStyleOptions = {},
): ToolbarItem[] {
  const items: ToolbarItem[] = []
  const indent = indentCommands(options)
  const align = (
    value: TextAlign,
    text: string,
    key: MessageKey,
    shortcut: string,
  ): ToolbarItem => ({
    type: 'button',
    id: `align-${value}`,
    text,
    label: (t) => t(key),
    shortcut,
    command: setTextAlign(value),
    isActive: (state) => isAligned(state, value),
  })
  items.push(
    align('left', '⇤', 'align.left', 'Shift-Mod-l'),
    align('center', '↔', 'align.center', 'Shift-Mod-e'),
    align('right', '⇥', 'align.right', 'Shift-Mod-r'),
    align('justify', '☰', 'align.justify', 'Shift-Mod-j'),
    {
      type: 'button',
      id: 'indent-less',
      text: '⇠',
      label: (t) => t('indent.less'),
      shortcut: 'Mod-[',
      command: indent.less,
    },
    {
      type: 'button',
      id: 'indent-more',
      text: '⇢',
      label: (t) => t('indent.more'),
      shortcut: 'Mod-]',
      command: indent.more,
    },
  )
  const { text_color, background_color, font_family, font_size } = schema.marks
  const colorMenu = (
    id: string,
    text: string,
    label: MessageKey,
    type: NonNullable<typeof text_color>,
    colors: ColorOption[],
  ): ToolbarItem => ({
    type: 'menu',
    id,
    text,
    label: (t) => t(label),
    entries: [
      ...colors.map((c): ToolbarMenuEntry => ({
        id: c.value,
        label: (t) => t(c.name),
        swatch: c.value,
        command: setMarkValue(type, { color: c.value }),
        isActive: (state) => markValue(state, type, 'color') === c.value,
      })),
      { id: 'none', label: (t) => t('color.remove'), command: setMarkValue(type, null) },
    ],
  })
  if (text_color)
    items.push(
      colorMenu(
        'text-color',
        'A',
        'color.text',
        text_color,
        options.textColors ?? defaultTextColors,
      ),
    )
  if (background_color) {
    items.push(
      colorMenu(
        'background-color',
        '▇',
        'color.background',
        background_color,
        options.backgroundColors ?? defaultBackgroundColors,
      ),
    )
  }
  if (font_family) {
    items.push({
      type: 'menu',
      id: 'font-family',
      text: 'Aa',
      label: (t) => t('font.family'),
      entries: [
        {
          id: 'default',
          label: (t) => t('font.default'),
          command: setMarkValue(font_family, null),
        },
        ...(options.fontFamilies ?? defaultFontFamilies).map((f): ToolbarMenuEntry => ({
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
      text: '↕A',
      label: (t) => t('font.size'),
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
