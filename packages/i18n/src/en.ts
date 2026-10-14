/** English messages. The key set of every locale must match this one. */
export const en = {
  'editor.label': 'Rich text editor',
  'toolbar.label': 'Formatting',
  'mark.bold': 'Bold',
  'mark.italic': 'Italic',
  'mark.underline': 'Underline',
  'mark.strike': 'Strikethrough',
  'mark.code': 'Inline code',
  'block.paragraph': 'Paragraph',
  'block.heading': 'Heading {level}',
  'block.blockquote': 'Quote',
  'list.bullet': 'Bulleted list',
  'list.ordered': 'Numbered list',
  'list.sink': 'Increase indent',
  'list.lift': 'Decrease indent',
  'history.undo': 'Undo',
  'history.redo': 'Redo',
  'shortcut.hint': '{label} ({shortcut})',
  'key.mod': 'Ctrl',
  'key.modMac': '⌘',
  'key.alt': 'Alt',
  'key.altMac': '⌥',
  'key.shift': 'Shift',
  'key.shiftMac': '⇧',
  'key.enter': 'Enter',
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
