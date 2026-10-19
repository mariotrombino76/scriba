import type { MessageKey, Translate } from '@scriba/i18n'
import type { IconName } from '@scriba/ui'
import type { EditorView } from '@scriba/view'
import type { Schema } from '@scriba/core'
import {
  MAX_ANSWER,
  beginPending,
  getPending,
  plainText,
  streamUpdate,
  type AiComplete,
  type AiMode,
  type AiParse,
  type AiStatus,
} from './session.js'
import { blocksParser, type AiBlocks } from './blocks.js'

export interface AiAction {
  id: string
  label: (t: Translate) => string
  icon?: IconName
  /** replace the selection, insert after it, or write at the cursor. */
  mode: AiMode
  /** Needs selected text (e.g. "improve"); otherwise it uses the text before the cursor. */
  needsSelection?: boolean
  /** The answer is blocks (a table, tasks…), not text: what it may contain. */
  blocks?: AiBlocks
}

export interface AiOptions {
  /** Calls your backend (see `AiComplete`). */
  complete: AiComplete
  /** Answer → content (default: plain text; pass a Markdown parser for formatting). */
  parse?: AiParse
  t: Translate
  /** Menu entries (default `defaultAiActions`). */
  actions?: AiAction[]
  /** Most characters of context sent for "continue" (default 4000). */
  maxContext?: number
}

const action = (id: string, key: MessageKey, mode: AiMode, needsSelection = true): AiAction => ({
  id,
  label: (t) => t(key),
  mode,
  needsSelection,
})

/**
 * Generative actions for the blocks the schema has: a table from the
 * selection, its tasks, the selection in a callout. The answer is blocks
 * (checked against the schema), pending until accepted, like any answer.
 */
export function blockAiActions(schema: Schema): AiAction[] {
  const list: AiAction[] = []
  const add = (id: string, key: MessageKey, mode: AiMode, node: string, icon: IconName) => {
    if (schema.nodes[node]) list.push({ ...action(id, key, mode), icon, blocks: { nodes: [node] } })
  }
  add('make_table', 'ai.action.table', 'after', 'table', 'table')
  add('extract_tasks', 'ai.action.tasks', 'after', 'task', 'task')
  add('to_callout', 'ai.action.callout', 'replace', 'callout', 'callout')
  return list
}

/** Continue, improve, fix, shorter, longer, summarize, translate. */
export const defaultAiActions: AiAction[] = [
  action('continue', 'ai.action.continue', 'cursor', false),
  action('improve', 'ai.action.improve', 'replace'),
  action('fix', 'ai.action.fix', 'replace'),
  action('shorter', 'ai.action.shorter', 'replace'),
  action('longer', 'ai.action.longer', 'replace'),
  action('summarize', 'ai.action.summarize', 'after'),
  action('translate', 'ai.action.translate', 'replace'),
]

const controllers = new WeakMap<EditorView, AbortController>()

/** Stops the answer being written (what arrived so far stays pending). */
export function stopAi(view: EditorView): void {
  controllers.get(view)?.abort()
}

/** Where the answer goes and which text is sent, from the selection and the mode. */
function target(
  view: EditorView,
  mode: AiMode,
  maxContext: number,
): { from: number; to: number; text: string } | null {
  const { state } = view
  const sel = state.selection
  if (mode === 'replace') {
    if (sel.empty) return null
    return { from: sel.from, to: sel.to, text: state.doc.textBetween(sel.from, sel.to, '\n', '\n') }
  }
  if (mode === 'after') {
    if (sel.empty) return null
    const $to = sel.$to
    const pos = $to.depth ? $to.after(1) : $to.pos // after the top-level block
    return { from: pos, to: pos, text: state.doc.textBetween(sel.from, sel.to, '\n', '\n') }
  }
  // cursor: the text before it as context
  const at = sel.to
  const before = state.doc.textBetween(Math.max(0, at - maxContext * 2), at, '\n', '\n')
  return { from: at, to: at, text: before.slice(-maxContext) }
}

/**
 * Runs an action: sends the request (only now, on the user's request, §5.9)
 * and streams the answer into the document as a pending, highlighted range.
 */
export async function runAi(
  view: EditorView,
  options: AiOptions,
  request: { action: string; prompt?: string; mode: AiMode; blocks?: AiBlocks },
): Promise<void> {
  if (getPending(view.state) || !view.editable) return
  const place = target(view, request.mode, options.maxContext ?? 4000)
  if (!place) return
  const parse = request.blocks ? blocksParser(request.blocks) : (options.parse ?? plainText)
  beginPending(view, place.from, place.to, { ...request, text: place.text })
  const controller = new AbortController()
  controllers.set(view, controller)
  let answer = ''
  let frame = 0
  const win = view.document.defaultView
  const flush = (status: AiStatus) => {
    if (frame) win?.cancelAnimationFrame(frame)
    frame = 0
    streamUpdate(view, answer, status, parse)
  }
  const schedule = () => {
    if (frame) return
    frame = win?.requestAnimationFrame(() => flush('streaming')) ?? 0
    if (!win) flush('streaming')
  }
  let status: AiStatus = 'done'
  try {
    const result = options.complete({
      action: request.action,
      ...(request.prompt ? { prompt: request.prompt } : {}),
      text: place.text,
      signal: controller.signal,
      ...(request.blocks ? { output: 'blocks' as const, blocks: request.blocks } : {}),
    })
    if (typeof (result as Promise<string>).then === 'function') {
      answer = String(await (result as Promise<string>)).slice(0, MAX_ANSWER)
    } else {
      for await (const chunk of result as AsyncIterable<string>) {
        if (controller.signal.aborted) break
        answer += String(chunk)
        if (answer.length >= MAX_ANSWER) {
          answer = answer.slice(0, MAX_ANSWER)
          break
        }
        schedule()
      }
    }
    if (controller.signal.aborted) status = 'stopped'
  } catch {
    status = controller.signal.aborted ? 'stopped' : 'error'
  } finally {
    controllers.delete(view)
  }
  if (getPending(view.state)) flush(status)
}

/** Runs the pending answer's request again (after Discard of the current answer). */
export function retryRequest(
  view: EditorView,
): { action: string; prompt?: string; mode: AiMode; blocks?: AiBlocks } | null {
  const p = getPending(view.state)
  return p
    ? {
        action: p.request.action,
        ...(p.request.prompt ? { prompt: p.request.prompt } : {}),
        mode: p.request.mode,
        ...(p.request.blocks ? { blocks: p.request.blocks } : {}),
      }
    : null
}

export { plainText }
