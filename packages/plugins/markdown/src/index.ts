import { keymap, type Plugin, type Schema } from '@scriba-editor/core'
import { inputRules, markdownInputRules, undoInputRule } from './rules.js'
export { serializeMarkdown } from './serialize.js'
export {
  parseMarkdown,
  markdownToHTML,
  DEFAULT_MAX_MARKDOWN_LENGTH,
  type MarkdownParseOptions,
} from './parse.js'

export {
  inputRules,
  markdownInputRules,
  undoInputRule,
  inputRulesKey,
  type InputRule,
} from './rules.js'

/**
 * Markdown typing shortcuts (`# ` heading, `- ` list, `**bold**`…) for the
 * nodes and marks of `schema`. Backspace right after a shortcut undoes it.
 */
export function markdownShortcuts(schema: Schema): Plugin[] {
  return [
    inputRules(markdownInputRules(schema)),
    keymap({ Backspace: undoInputRule }, { priority: 100 }),
  ]
}
