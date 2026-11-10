import type { KeyBindings, Schema } from '@scriba-editor/core'
import type { ToolbarControl, ToolbarMenuEntry } from '@scriba-editor/ui'
import {
  exitCodeBlock,
  exitOnTripleEnter,
  isInCodeBlock,
  resetEmptyCodeBlock,
  setCodeLanguage,
  toggleCodeBlock,
} from './commands.js'

export { codeBlockNodes, LANGUAGE } from './nodes.js'
export {
  codeHighlight,
  codeHighlightKey,
  type HighlightOptions,
  type Lowlight,
} from './highlight.js'
export * from './commands.js'

/** Languages offered in the toolbar menu (they must be registered in your lowlight instance). */
export const defaultCodeLanguages = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'xml', label: 'HTML / XML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
]

/**
 * Keys (higher priority than the base keymap): Mod+Alt+Shift+C toggles a code block
 * (not Mod+Alt+C: Chrome uses it for DevTools),
 * Mod+Enter / triple Enter leave it, Backspace in an empty one resets it.
 * Tab is NOT captured, so keyboard users can always leave the editor.
 */
export function codeBlockKeymap(): KeyBindings {
  return {
    'Shift-Mod-Alt-c': toggleCodeBlock,
    'Mod-Enter': exitCodeBlock,
    Enter: exitOnTripleEnter,
    Backspace: resetEmptyCodeBlock,
  }
}

/** Toolbar: code block toggle and language menu. */
export function codeBlockToolbarItems(
  schema: Schema,
  languages: { id: string; label: string }[] = defaultCodeLanguages,
): ToolbarControl[] {
  if (!schema.nodes['code_block'])
    throw new RangeError('The schema has no "code_block" node (add codeBlockNodes)')
  const language = (state: Parameters<typeof isInCodeBlock>[0]) =>
    state.selection.$from.parent.type.spec.code
      ? (state.selection.$from.parent.attrs['language'] ?? null)
      : undefined
  return [
    {
      type: 'button',
      id: 'code_block',
      icon: 'codeBlock',
      label: (t) => t('block.codeBlock'),
      shortcut: 'Shift-Mod-Alt-c',
      command: toggleCodeBlock,
      isActive: isInCodeBlock,
    },
    {
      type: 'menu',
      id: 'code_language',
      label: (t) => t('code.language'),
      // Contextual: only inside a code block, showing the current language.
      isVisible: isInCodeBlock,
      valueLabel: (state, t) => {
        const id = language(state)
        return languages.find((l) => l.id === id)?.label ?? t('code.plain')
      },
      entries: [
        {
          id: 'plain',
          label: (t) => t('code.plain'),
          command: setCodeLanguage(null),
          isActive: (state) => language(state) === null,
        },
        ...languages.map((l): ToolbarMenuEntry => ({
          id: l.id,
          label: () => l.label,
          command: setCodeLanguage(l.id),
          isActive: (state) => language(state) === l.id,
        })),
      ],
    },
  ]
}
