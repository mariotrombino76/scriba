import type { KeyBindings } from '@scriba-editor/core'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView } from '@scriba-editor/view'
import { openHelpDialog, type HelpOptions } from './dialog.js'

export { openHelpDialog, type HelpOptions } from './dialog.js'
export {
  shortcutsFromItems,
  editingHelp,
  markdownHelp,
  navigationHelp,
  type HelpGroup,
  type HelpShortcut,
} from './shortcuts.js'

/** "Keyboard shortcuts…" for the Help menu (Alt+0, as in TinyMCE); also when read-only. */
export function helpItem(options: HelpOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'help',
    icon: 'help',
    label: (tr) => tr('help.shortcuts'),
    shortcut: 'Alt-0',
    command: () => true,
    readOnly: true,
    run: (view) => void openHelpDialog(view, options),
  }
}

/** Alt+0 opens the shortcuts dialog (give the keymap `readOnly: true`). */
export function helpKeymap(options: HelpOptions): KeyBindings {
  return {
    'Alt-0': (_state, _dispatch, view) => {
      if (!view) return false
      openHelpDialog(view as EditorView, options)
      return true
    },
  }
}
