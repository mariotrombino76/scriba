import {
  ADD_TO_HISTORY,
  CLOSE_HISTORY,
  Fragment,
  Plugin,
  PluginKey,
  Slice,
  TextSelection,
  insertContent,
  type EditorState,
  type Schema,
  type Transaction,
} from '@scriba/core'
import type { EditorView, InlineDecoration } from '@scriba/view'

/** What is sent to your backend (only on an explicit user action, §5.9). */
export interface AiRequest {
  /** The action chosen ("improve", "continue", or "custom" for a free prompt). */
  action: string
  /** The user's own words (free prompt), if any. */
  prompt?: string
  /** The selected text, or the text before the cursor for "continue" (plain text). */
  text: string
  /** Aborted when the user presses Stop or closes the editor. */
  signal: AbortSignal
}

/**
 * Your connection to a model: call YOUR backend (never put API keys in the
 * page) and return the answer as it streams (chunks of text) or all at once.
 */
export type AiComplete = (request: AiRequest) => AsyncIterable<string> | Promise<string>

/** How the answer is turned into content: plain text paragraphs (default) or e.g. Markdown. */
export type AiParse = (text: string, schema: Schema) => Fragment

export type AiStatus = 'streaming' | 'done' | 'error' | 'stopped'

export interface AiPending {
  /** Range now holding the answer (mapped through other changes). */
  from: number
  to: number
  /** What was there before (restored by Discard). */
  original: Slice
  /** The raw answer so far. */
  text: string
  status: AiStatus
  /** For Retry. */
  request: { action: string; prompt?: string; text: string; mode: AiMode }
}

/** Where the answer goes. */
export type AiMode = 'replace' | 'after' | 'cursor'

export const aiKey = new PluginKey<AiPending | null>('ai')
const AI_META = 'aiStream'

/** Longest answer accepted (characters); the stream stops there. */
export const MAX_ANSWER = 100_000

/** Plain text → paragraphs (one per line); never markup. */
export function plainText(text: string, schema: Schema): Fragment {
  const p = schema.nodes['paragraph']!
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return Fragment.fromArray(lines.map((l) => p.create(null, l ? schema.text(l) : null)))
}

export function getPending(state: EditorState): AiPending | null {
  return aiKey.getState(state) ?? null
}

/**
 * Keeps the pending answer (range, original content, status), highlights it,
 * and while it is pending blocks your own edits (other users' changes still
 * arrive and the range follows them).
 */
export function aiPlugin(): Plugin<AiPending | null> {
  return new Plugin<AiPending | null>({
    key: aiKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta<AiPending | null | undefined>(aiKey)
        if (meta !== undefined) return meta
        if (!value || !tr.docChanged) return value
        const from = tr.mapping.map(value.from, -1)
        const to = Math.max(from, tr.mapping.map(value.to, 1))
        return { ...value, from, to }
      },
    },
    filterTransaction(tr, state) {
      if (!getPending(state) || !tr.docChanged) return true
      // our own stream, or changes from elsewhere (collaboration): allowed
      return !!tr.getMeta(AI_META) || tr.getMeta(ADD_TO_HISTORY) === false
    },
    props: {
      decorations(state: EditorState): InlineDecoration[] {
        const p = getPending(state)
        return p && p.to > p.from ? [{ from: p.from, to: p.to, class: 'scriba-ai-pending' }] : []
      },
    },
  })
}

/** Content for the answer so far (parsed like a paste: untrusted, §5.9). */
function answerContent(
  state: EditorState,
  text: string,
  parse: AiParse,
  inline: boolean,
): Fragment {
  let content: Fragment
  try {
    content = parse(text, state.schema)
  } catch {
    content = plainText(text, state.schema)
  }
  // a short single-paragraph answer inside a line stays inline (e.g. a rewritten phrase)
  if (inline && content.childCount === 1 && content.firstChild!.isTextblock) {
    let inner = content.firstChild!.content
    // parsers trim the edges, but " and then…" must not stick to the word before
    const lead = /^[ \t]+/.exec(text)?.[0]
    const trail = /[ \t]+$/.exec(text)?.[0]
    if (lead && !inner.firstChild?.text?.startsWith(lead))
      inner = Fragment.from(state.schema.text(lead)).append(inner)
    if (trail && inner.size && !inner.lastChild?.text?.endsWith(trail))
      inner = inner.append(Fragment.from(state.schema.text(trail)))
    return inner
  }
  return content
}

/**
 * Puts `content` in place of the pending range, fitted like a paste (blocks
 * inside a paragraph split it); returns the new range end.
 */
function replaceRange(tr: Transaction, from: number, to: number, content: Fragment): number {
  if (!content.size) {
    if (to > from) tr.delete(from, to)
    return from
  }
  const end = insertContent(tr, from, to, content)
  if (end === null) throw new RangeError('cannot place the answer here')
  return end
}

/** One update of the stream (not in the undo history: Accept makes the single undo step). */
export function streamUpdate(
  view: EditorView,
  text: string,
  status: AiStatus,
  parse: AiParse,
): void {
  const p = getPending(view.state)
  if (!p) return
  const tr = view.state.tr
  const inline =
    p.original.content.childCount <= 1 && view.state.doc.resolve(p.from).parent.inlineContent
  let to = p.to
  try {
    to = replaceRange(tr, p.from, p.to, answerContent(view.state, text, parse, inline))
  } catch {
    to = replaceRange(tr, p.from, p.to, plainText(text, view.state.schema).firstChild!.content)
  }
  tr.setMeta(AI_META, true).setMeta(ADD_TO_HISTORY, false)
  tr.setMeta(aiKey, { ...p, to, text, status })
  view.dispatch(tr)
}

/** Starts a pending answer at the range (nothing changes until the first chunk). */
export function beginPending(
  view: EditorView,
  from: number,
  to: number,
  request: AiPending['request'],
): void {
  const original = view.state.doc.slice(from, to)
  const tr = view.state.tr.setMeta(aiKey, {
    from,
    to,
    original,
    text: '',
    status: 'streaming',
    request,
  } satisfies AiPending)
  view.dispatch(tr)
}

/** Keeps the answer: one undo step from the original to the answer. */
export function acceptPending(view: EditorView): void {
  const p = getPending(view.state)
  if (!p || p.status === 'streaming') return
  const answer = view.state.doc.slice(p.from, p.to)
  // back to the original (outside history), then the answer as one normal, undoable change
  const revert = view.state.tr.replace(p.from, p.to, p.original)
  revert.setMeta(AI_META, true).setMeta(ADD_TO_HISTORY, false)
  const end = p.from + p.original.size
  view.dispatch(revert)
  const tr = view.state.tr.setMeta(aiKey, null).setMeta(CLOSE_HISTORY, true).setMeta(AI_META, true)
  tr.replace(p.from, end, answer)
  const after = tr.mapping.map(end, 1)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after, tr.doc.content.size)), -1))
  view.dispatch(tr.scrollIntoView())
}

/** Drops the answer and puts the original back (nothing in the undo history). */
export function discardPending(view: EditorView): void {
  const p = getPending(view.state)
  if (!p) return
  const tr = view.state.tr.replace(p.from, p.to, p.original)
  tr.setMeta(AI_META, true).setMeta(ADD_TO_HISTORY, false).setMeta(aiKey, null)
  view.dispatch(tr)
}

export function isPending(state: EditorState): boolean {
  return !!getPending(state)
}
