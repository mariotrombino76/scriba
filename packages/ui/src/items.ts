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
import type { Translate } from '@scriba/i18n'

/** A toolbar button bound to a command. */
export interface ToolbarButton {
  type: 'button'
  /** Stable id, also used as CSS hook (`data-item`). */
  id: string
  /** Short visible content (glyph). Decorative: the accessible name is `label`. */
  text: string
  label: (t: Translate) => string
  /** Key binding shown in the tooltip, e.g. `"Mod-b"`. */
  shortcut?: string
  command: Command
  /** For toggle buttons: whether the format is active (sets `aria-pressed`). */
  isActive?: (state: EditorState) => boolean
}

export interface ToolbarSeparator {
  type: 'separator'
}

export type ToolbarItem = ToolbarButton | ToolbarSeparator

const separator: ToolbarSeparator = { type: 'separator' }

/** Default toolbar for whatever node/mark types the schema has (Phase 1 set). */
export function defaultToolbarItems(schema: Schema): ToolbarItem[] {
  const { marks, nodes } = schema
  const markButton = (name: string, text: string, shortcut: string): ToolbarButton[] => {
    const type = marks[name]
    if (!type) return []
    return [
      {
        type: 'button',
        id: name,
        text,
        label: (t) => t(`mark.${name}` as Parameters<Translate>[0]),
        shortcut,
        command: toggleMark(type),
        isActive: (state) => isMarkActive(state, type),
      },
    ]
  }
  const blockActive =
    (name: string, level?: number) =>
    (state: EditorState): boolean => {
      const { $from, $to } = state.selection
      const parent = $from.parent
      return (
        $from.sameParent($to) &&
        parent.type.name === name &&
        (level === undefined || parent.attrs['level'] === level)
      )
    }

  const items: ToolbarItem[] = [
    ...markButton('bold', 'B', 'Mod-b'),
    ...markButton('italic', 'I', 'Mod-i'),
    ...markButton('underline', 'U', 'Mod-u'),
    ...markButton('strike', 'S', 'Shift-Mod-s'),
    ...markButton('code', '</>', 'Mod-e'),
  ]
  const blocks: ToolbarItem[] = []
  if (nodes['paragraph']) {
    blocks.push({
      type: 'button',
      id: 'paragraph',
      text: '¶',
      label: (t) => t('block.paragraph'),
      shortcut: 'Mod-Alt-0',
      command: setBlockType(nodes['paragraph']),
      isActive: blockActive('paragraph'),
    })
  }
  if (nodes['heading']) {
    for (const level of [1, 2, 3]) {
      blocks.push({
        type: 'button',
        id: `heading-${level}`,
        text: `H${level}`,
        label: (t) => t('block.heading', { level }),
        shortcut: `Mod-Alt-${level}`,
        command: setBlockType(nodes['heading'], { level }),
        isActive: blockActive('heading', level),
      })
    }
  }
  const history: ToolbarItem[] = [
    {
      type: 'button',
      id: 'undo',
      text: '↶',
      label: (t) => t('history.undo'),
      shortcut: 'Mod-z',
      command: undo,
    },
    {
      type: 'button',
      id: 'redo',
      text: '↷',
      label: (t) => t('history.redo'),
      shortcut: 'Mod-y',
      command: redo,
    },
  ]
  return [items, blocks, history]
    .filter((g) => g.length)
    .flatMap((g, i) => (i ? [separator, ...g] : g))
}
