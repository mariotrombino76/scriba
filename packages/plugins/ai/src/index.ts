import { Plugin, type Command, type KeyBindings } from '@scriba-editor/core'
import type { ToolbarButton } from '@scriba-editor/ui'
import type { EditorView, ViewPluginProps } from '@scriba-editor/view'
import type { AiOptions } from './run.js'
import { stopAi } from './run.js'
import { acceptPending, aiPlugin, discardPending, getPending } from './session.js'
import { aiBarView, openAiMenu } from './ui.js'

export {
  aiKey,
  getPending,
  isPending,
  acceptPending,
  discardPending,
  plainText,
  MAX_ANSWER,
  type AiRequest,
  type AiComplete,
  type AiParse,
  type AiPending,
  type AiStatus,
  type AiMode,
} from './session.js'
export {
  runAi,
  stopAi,
  defaultAiActions,
  blockAiActions,
  variantAiActions,
  selectVariant,
  MAX_VARIANTS,
  type AiAction,
  type AiOptions,
} from './run.js'
export {
  blocksParser,
  aiBlocksJsonSchema,
  aiBlocksPrompt,
  DEFAULT_AI_MARKS,
  MAX_AI_BLOCKS,
  MAX_AI_NODES,
  type AiBlocks,
} from './blocks.js'
export { openAiMenu, closeAiMenu } from './ui.js'

/**
 * AI assistant: bring your own backend through `options.complete`. Answers
 * are untrusted content (parsed like a paste, or blocks checked against the
 * schema), shown as a pending range the user accepts (one undo step) or
 * discards; the AI can only insert content, never run anything.
 */
export function aiAssistant(options: AiOptions): Plugin[] {
  const props: ViewPluginProps = { pluginView: (view) => aiBarView(view, options) }
  return [aiPlugin(), new Plugin({ props: { ...props } })]
}

/** Ctrl/Cmd+J opens the menu; with an answer pending: Ctrl/Cmd+Enter accepts, Escape stops or discards. */
export function aiKeymap(options: AiOptions): KeyBindings {
  const open: Command = (state, dispatch, view) => {
    if (!view || getPending(state)) return false
    if (dispatch) openAiMenu(view as EditorView, options)
    return true
  }
  const accept: Command = (state, dispatch, view) => {
    const p = getPending(state)
    if (!view || !p || p.status === 'streaming' || p.status === 'error') return false
    if (dispatch) acceptPending(view as EditorView)
    return true
  }
  const escape: Command = (state, dispatch, view) => {
    const p = getPending(state)
    if (!view || !p) return false
    if (dispatch) {
      if (p.status === 'streaming') stopAi(view as EditorView)
      else discardPending(view as EditorView)
    }
    return true
  }
  return { 'Mod-j': open, 'Mod-Enter': accept, Escape: escape }
}

export function aiToolbarItem(options: AiOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'ai',
    icon: 'sparkles',
    label: (t) => t('ai.button'),
    shortcut: 'Mod-j',
    command: (state) => !getPending(state),
    run: (view) => openAiMenu(view, options),
  }
}
