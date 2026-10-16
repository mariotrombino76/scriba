import type { Schema } from '../model/schema.js'
import { arrowAtom } from './arrows.js'
import { redo, undo } from '../history.js'
import type { KeyBindings } from '../keymap.js'
import {
  chainCommands,
  deleteChar,
  deleteSelection,
  deleteSelectedBlock,
  insertNode,
  joinBackward,
  joinForward,
  newlineInCode,
  selectAll,
  setBlockType,
  splitBlock,
} from './base.js'
import { toggleMark } from './marks.js'
import { liftEmptyBlock, liftEmptyOrFirstBlock } from './structure.js'

/** Editing keys that work with any schema: Enter, Backspace, Delete, select all. */
export const baseKeymap: KeyBindings = {
  Enter: chainCommands(newlineInCode, liftEmptyBlock, splitBlock),
  Backspace: chainCommands(
    deleteSelectedBlock(-1),
    deleteSelection,
    liftEmptyOrFirstBlock,
    joinBackward,
    deleteChar(-1),
  ),
  'Mod-Backspace': chainCommands(deleteSelection, joinBackward),
  Delete: chainCommands(deleteSelectedBlock(1), deleteSelection, joinForward, deleteChar(1)),
  'Mod-Delete': chainCommands(deleteSelection, joinForward),
  'Mod-a': selectAll,
  ArrowLeft: arrowAtom('left'),
  ArrowRight: arrowAtom('right'),
  ArrowUp: arrowAtom('up'),
  ArrowDown: arrowAtom('down'),
}

/** History keys: Mod-z undo, Mod-y / Shift-Mod-z redo. */
export const historyKeymap: KeyBindings = {
  'Mod-z': undo,
  'Mod-y': redo,
  'Shift-Mod-z': redo,
}

/**
 * Formatting keys for the node/mark types present in the schema:
 * Mod-b/i/u bold/italic/underline, Mod-Shift-s strike, Mod-e code,
 * Shift-Enter hard break, Mod-Alt-0 paragraph, Mod-Alt-1..6 headings.
 */
export function formatKeymap(schema: Schema): KeyBindings {
  const keys: KeyBindings = {}
  const { marks, nodes } = schema
  if (marks['bold']) keys['Mod-b'] = toggleMark(marks['bold'])
  if (marks['italic']) keys['Mod-i'] = toggleMark(marks['italic'])
  if (marks['underline']) keys['Mod-u'] = toggleMark(marks['underline'])
  if (marks['strike']) keys['Shift-Mod-s'] = toggleMark(marks['strike'])
  if (marks['code']) keys['Mod-e'] = toggleMark(marks['code'])
  if (nodes['hard_break']) keys['Shift-Enter'] = insertNode(nodes['hard_break'])
  if (nodes['paragraph']) keys['Mod-Alt-0'] = setBlockType(nodes['paragraph'])
  if (nodes['heading']) {
    for (let level = 1; level <= 6; level++)
      keys[`Mod-Alt-${level}`] = setBlockType(nodes['heading'], { level })
  }
  return keys
}
