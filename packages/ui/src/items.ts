import {
  isMarkActive,
  redo,
  setBlockType,
  toggleMark,
  undo,
  type Command,
  type EditorState,
  type Schema,
} from '@scriba/core'
import type { MessageKey, Translate } from '@scriba/i18n'
import type { EditorView } from '@scriba/view'
import type { IconName } from './icons.js'

/** A toolbar button bound to a command. */
export interface ToolbarButton {
  type: 'button'
  /** Stable id, also used as CSS hook (`data-item`). */
  id: string
  /** Icon (preferred) … */
  icon?: IconName
  /** … or a short glyph (e.g. `B`). Decorative: the accessible name is `label`. */
  text?: string
  label: (t: Translate) => string
  /** Key binding shown in the tooltip, e.g. `"Mod-b"`. */
  shortcut?: string
  command: Command
  /** For toggle buttons: whether the format is active (sets `aria-pressed`). */
  isActive?: (state: EditorState) => boolean
  /** Contextual items: hidden when this returns false (e.g. code language outside code). */
  isVisible?: (state: EditorState) => boolean
  /** When space is short, lower priorities move into "More options" first. Default: the group's. */
  priority?: number
  /**
   * Custom action instead of running `command` (e.g. open a dialog).
   * `command` is still used to decide whether the button is enabled.
   */
  run?: (view: EditorView) => void
}

/** One choice in a toolbar menu (a color, a font, a block style…). */
export interface ToolbarMenuEntry {
  id: string
  label: (t: Translate) => string
  /** Visible text (defaults to the label). */
  text?: string
  icon?: IconName
  /** A color shown as a swatch (validated before use). */
  swatch?: string
  /** CSS class giving the entry a preview look (e.g. a heading size). */
  preview?: string
  shortcut?: string
  command: Command
  /** Marks the current choice (`aria-checked`). */
  isActive?: (state: EditorState) => boolean
  /** With `isActive`: a toggle (`menuitemcheckbox`) instead of a choice (`menuitemradio`). */
  toggle?: boolean
  /** Runs instead of `command` (e.g. opens a dialog); `command` still decides whether it is enabled. */
  run?: (view: EditorView) => void
  /** In a `size` menu: the (row, column) this entry stands for, 1-based (e.g. a table size). */
  cell?: readonly [number, number]
}

/** A button opening a popup menu (WAI-ARIA menu button pattern). */
export interface ToolbarMenu {
  type: 'menu'
  id: string
  label: (t: Translate) => string
  icon?: IconName
  text?: string
  /** Shows the current value on the button (e.g. "Titolo 2"), like a select. */
  valueLabel?: (state: EditorState, t: Translate) => string
  /** A color bar under the icon showing the current color. */
  indicator?: (state: EditorState) => string | null
  /**
   * `grid`: color swatches in a grid, other entries as rows below.
   * `size`: entries with a `cell` form a rows×columns picker (hovering 3×4
   * highlights the 3×4 area, arrows move in two dimensions); others are rows below.
   */
  layout?: 'list' | 'grid' | 'size'
  /** Columns of a `size` picker. */
  columns?: number
  entries: ToolbarMenuEntry[]
  isVisible?: (state: EditorState) => boolean
  /** When space is short, lower priorities move into "More options" first. Default: the group's. */
  priority?: number
}

/** A named group of controls (`role="group"`), visually separated from the next. */
export interface ToolbarGroup {
  type: 'group'
  id: string
  label: (t: Translate) => string
  items: ToolbarControl[]
  /** Default overflow priority of the group's controls (default 1; higher stays visible longer). */
  priority?: number
}

/** @deprecated Use groups: they are separated automatically. */
export interface ToolbarSeparator {
  type: 'separator'
}

export type ToolbarControl = ToolbarButton | ToolbarMenu
export type ToolbarItem = ToolbarControl | ToolbarGroup | ToolbarSeparator

/** Builds a group (empty groups are dropped by the toolbar). */
export function toolbarGroup(
  id: string,
  label: MessageKey,
  items: ToolbarControl[],
  priority?: number,
): ToolbarGroup {
  return {
    type: 'group',
    id,
    label: (t) => t(label),
    items,
    ...(priority !== undefined ? { priority } : {}),
  }
}

/** Undo / redo. */
export function historyItems(): ToolbarButton[] {
  return [
    {
      type: 'button',
      id: 'undo',
      icon: 'undo',
      label: (t) => t('history.undo'),
      shortcut: 'Mod-z',
      command: undo,
    },
    {
      type: 'button',
      id: 'redo',
      icon: 'redo',
      label: (t) => t('history.redo'),
      shortcut: 'Mod-y',
      command: redo,
    },
  ]
}

/** Bold, italic, underline, strike, inline code — whichever the schema has. */
export function markItems(schema: Schema): ToolbarButton[] {
  const spec: [string, string | null, IconName | null, string][] = [
    ['bold', 'B', null, 'Mod-b'],
    ['italic', 'I', null, 'Mod-i'],
    ['underline', 'U', null, 'Mod-u'],
    ['strike', 'S', null, 'Shift-Mod-s'],
    ['code', null, 'code', 'Mod-e'],
  ]
  const items: ToolbarButton[] = []
  for (const [name, text, icon, shortcut] of spec) {
    const type = schema.marks[name]
    if (!type) continue
    items.push({
      type: 'button',
      id: name,
      ...(text ? { text } : {}),
      ...(icon ? { icon } : {}),
      label: (t) => t(`mark.${name}` as MessageKey),
      shortcut,
      // bold, italic, underline stay visible longest
      priority: name === 'bold' || name === 'italic' || name === 'underline' ? 3 : 1,
      command: toggleMark(type),
      isActive: (state) => isMarkActive(state, type),
    })
  }
  return items
}

/** Name of the block type at the selection, or null when the selection spans several kinds. */
function currentBlock(state: EditorState): { name: string; level: number | null } | null {
  const { $from, $to } = state.selection
  if (!$from.sameParent($to) && $from.parent.type !== $to.parent.type) return null
  const parent = $from.parent
  return { name: parent.type.name, level: (parent.attrs['level'] as number | undefined) ?? null }
}

/**
 * "Paragraph style" menu: paragraph and heading levels, each previewed in its
 * own look, showing the current style on the button.
 */
export function blockStyleMenu(
  schema: Schema,
  levels: readonly number[] = [1, 2, 3],
): ToolbarMenu | null {
  const { paragraph, heading } = schema.nodes
  if (!paragraph && !heading) return null
  const entries: ToolbarMenuEntry[] = []
  if (paragraph) {
    entries.push({
      id: 'paragraph',
      label: (t) => t('block.paragraph'),
      preview: 'scriba-preview-paragraph',
      shortcut: 'Mod-Alt-0',
      command: setBlockType(paragraph),
      isActive: (state) => currentBlock(state)?.name === 'paragraph',
    })
  }
  if (heading) {
    for (const level of levels) {
      entries.push({
        id: `heading-${level}`,
        label: (t) => t('block.heading', { level }),
        preview: `scriba-preview-h${level}`,
        shortcut: `Mod-Alt-${level}`,
        command: setBlockType(heading, { level }),
        isActive: (state) => {
          const cur = currentBlock(state)
          return cur?.name === 'heading' && cur.level === level
        },
      })
    }
  }
  return {
    type: 'menu',
    id: 'block-style',
    label: (t) => t('block.style'),
    valueLabel: (state, t) => {
      const cur = currentBlock(state)
      if (cur?.name === 'paragraph') return t('block.paragraph')
      if (cur?.name === 'heading' && cur.level) return t('block.heading', { level: cur.level })
      return '—'
    },
    entries,
  }
}

/** Default toolbar for the Phase 1 schema: history, paragraph style, character formatting. */
export function defaultToolbarItems(schema: Schema): ToolbarItem[] {
  const style = blockStyleMenu(schema)
  return [
    toolbarGroup('history', 'toolbar.group.history', historyItems(), 3),
    toolbarGroup('text-style', 'toolbar.group.textStyle', style ? [style] : [], 3),
    toolbarGroup('format', 'toolbar.group.format', markItems(schema), 2),
  ]
}
