import { CLOSE_HISTORY, PluginKey, type EditorState, type Transaction } from '@scriba/core'
import type { EditorView } from '@scriba/view'
import { isMentionId, isMentionLabel, MAX_LABEL_LENGTH } from './nodes.js'
import { isLoading as loading, type SuggestState } from './suggest.js'

/** A person found by your `search` callback. */
export interface MentionItem {
  /** The person's id in your system (1–200 characters, no spaces). */
  id: string
  /** Name shown in the list and in the text (1–100 characters). */
  label: string
  /** Extra line in the list (e.g. role or e-mail); never inserted in the text. */
  detail?: string
}

export type MentionState = SuggestState<MentionItem>

export const mentionKey = new PluginKey<MentionState>('mention')

const CLOSED: MentionState = {
  active: false,
  from: 0,
  query: '',
  index: 0,
  results: [],
  resultsFor: null,
  error: false,
}
export { MAX_QUERY } from './suggest.js'

export function getMentionState(state: EditorState): MentionState {
  return mentionKey.getState(state) ?? CLOSED
}

/** A search is still running for the current query. */
export const isLoading = (s: MentionState): boolean => loading(s)

/**
 * Keeps only well-formed entries (the source is outside the editor): valid id
 * and label, single-line detail, no duplicate ids, at most `max`.
 */
export function cleanResults(raw: unknown, max: number): MentionItem[] {
  if (!Array.isArray(raw)) return []
  const out: MentionItem[] = []
  const seen = new Set<string>()
  for (const entry of raw as unknown[]) {
    if (out.length >= max) break
    if (!entry || typeof entry !== 'object') continue
    const { id, label, detail } = entry as Record<string, unknown>
    const name = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim() : label
    if (!isMentionId(id) || !isMentionLabel(name) || seen.has(id)) continue
    seen.add(id)
    const item: MentionItem = { id, label: name }
    if (typeof detail === 'string') {
      const line = detail.replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH).trim()
      if (line && isMentionLabel(line)) item.detail = line
    }
    out.push(item)
  }
  return out
}

/** Opens on "@" at the start of a block or after a space (not in an e-mail address). */
export function canOpenMention(state: EditorState, from: number): boolean {
  const type = state.schema.nodes['mention']
  const $pos = state.doc.resolve(from)
  if (!type || !$pos.parent.type.canContain(type)) return false
  const before = $pos.parent.textBetween(
    Math.max(0, $pos.parentOffset - 1),
    $pos.parentOffset,
    '',
    '￼',
  )
  return !before || /\s/.test(before)
}

/** Names have single spaces ("Anna Rossi"); a leading or double space ends the mention. */
export const isMentionQuery = (query: string): boolean => !/^\s|\s\s/.test(query)

/** "@query" replaced by the mention and a space (cursor after it). */
export function mentionInsert(
  state: EditorState,
  from: number,
  to: number,
  item: MentionItem,
): Transaction | null {
  const type = state.schema.nodes['mention']
  if (!type) return null
  const marks = state.doc.resolve(from).marks()
  const node = type.create({ id: item.id, label: item.label }, null, marks)
  return state.tr.replaceWith(from, to, [node, state.schema.text(' ', marks)])
}

export function closeMention(tr: Transaction): Transaction {
  return tr.setMeta(mentionKey, CLOSED)
}

/** Replaces "@query" with the mention and a space, cursor after it. */
export function chooseMention(view: EditorView, item: MentionItem): boolean {
  const s = getMentionState(view.state)
  if (!s.active) return false
  const tr = mentionInsert(view.state, s.from, view.state.selection.head, item)
  if (!tr) return false
  // its own undo step: Ctrl+Z right after brings the typed "@query" back
  view.dispatch(closeMention(tr).setMeta(CLOSE_HISTORY, true).scrollIntoView())
  view.focus()
  return true
}
