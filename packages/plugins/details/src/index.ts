import { isInNode, Plugin, type Command, type KeyBindings, type Schema } from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import type { ToolbarButton } from '@scriba/ui'
import {
  enterFromSummary,
  insertDetails,
  removeDetails,
  removeEmptyDetails,
  toggleDetailsOpen,
} from './commands.js'

export { detailsNodes } from './nodes.js'
export { detailsNodeView } from './view.js'
export {
  enterFromSummary,
  findDetails,
  insertDetails,
  removeDetails,
  removeEmptyDetails,
  setDetailsOpen,
  toggleDetailsOpen,
} from './commands.js'

/** Enter in a title goes to the content; Backspace in an empty section removes it. */
export function detailsKeymap(): KeyBindings {
  return { Enter: enterFromSummary, Backspace: removeEmptyDetails }
}

/**
 * Opens a closed section when the cursor moves into its hidden content
 * (arrow keys, search, undo…), so the cursor is never somewhere invisible.
 */
export function detailsAutoOpen(): Plugin {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged || tr.selectionSet)) return null
      const { $head } = state.selection
      let tr = null
      for (let d = $head.depth - 1; d > 0; d--) {
        const node = $head.node(d)
        // inside the content (not the title) of a closed section
        if (node.type.name === 'details' && $head.index(d) > 0 && !node.attrs['open'])
          tr = (tr ?? state.tr).setNodeAttrs($head.before(d), { open: true })
      }
      return tr
    },
  })
}

/** Toolbar button: puts the selected blocks in a section, or takes them out of it. */
export function detailsToolbarItem(schema: Schema): ToolbarButton {
  const type = schema.nodes['details']!
  const insert = insertDetails(schema)
  const remove = removeDetails(schema)
  const command: Command = (state, dispatch, view) =>
    isInNode(state, type) ? remove(state, dispatch, view) : insert(state, dispatch, view)
  return {
    type: 'button',
    id: 'details',
    icon: 'details',
    label: (t) => t('details.insert'),
    command,
    isActive: (state) => isInNode(state, type),
  }
}

/** Menu entry: opens or closes the section at the cursor (the keyboard way to do it). */
export function detailsToggleItem(): ToolbarButton {
  return {
    type: 'button',
    id: 'details-toggle',
    icon: 'chevronRight',
    label: (t) => t('details.toggle'),
    command: toggleDetailsOpen,
  }
}

/** Slash menu entry ("/fisarmonica"). */
export function detailsSlashItem(schema: Schema): {
  id: string
  label: (t: Translate) => string
  keywords: string[]
  icon: 'details'
  command: Command
} {
  return {
    id: 'details',
    label: (t) => t('details.insert'),
    keywords: [
      'accordion',
      'fisarmonica',
      'details',
      'sezione',
      'comprimibile',
      'collapse',
      'toggle',
    ],
    icon: 'details',
    command: insertDetails(schema),
  }
}
