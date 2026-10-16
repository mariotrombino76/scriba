import { CLOSE_HISTORY, Plugin, PluginKey, type EditorState, type Transaction } from '@scriba/core'
import type { EditorView, ViewPluginProps } from '@scriba/view'
import { mentionMenuView, type MentionMenuOptions } from './menu.js'
import { isMentionId, isMentionLabel, MAX_LABEL_LENGTH } from './nodes.js'

/** A person found by your `search` callback. */
export interface MentionItem {
  /** The person's id in your system (1–200 characters, no spaces). */
  id: string
  /** Name shown in the list and in the text (1–100 characters). */
  label: string
  /** Extra line in the list (e.g. role or e-mail); never inserted in the text. */
  detail?: string
}

export interface MentionState {
  active: boolean
  /** Position of the "@" that opened the list. */
  from: number
  query: string
  /** Highlighted entry. */
  index: number
  /** Last results received (they stay visible while the next search runs). */
  results: readonly MentionItem[]
  /** Query of `results`; differs from `query` while a search is pending. */
  resultsFor: string | null
  /** The last search failed. */
  error: boolean
}

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
export const MAX_QUERY = 50

export function getMentionState(state: EditorState): MentionState {
  return mentionKey.getState(state) ?? CLOSED
}

/** A search is still running for the current query. */
export function isLoading(s: MentionState): boolean {
  return s.active && s.resultsFor !== s.query
}

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

/** The "@query" text still there and the cursor right after it? Otherwise the list closes. */
function stillValid(state: EditorState, s: MentionState): MentionState {
  const { selection, doc } = state
  if (!selection.empty || s.from >= doc.content.size) return CLOSED
  const $from = doc.resolve(s.from)
  const head = selection.head
  if (head <= s.from || !$from.sameParent(selection.$head)) return CLOSED
  if (doc.textBetween(s.from, s.from + 1) !== '@') return CLOSED
  const query = doc.textBetween(s.from + 1, head, '\n', '\n')
  // names have single spaces ("Anna Rossi"); a leading or double space ends the mention
  if (/\n|^\s|\s\s/.test(query) || query.length > MAX_QUERY) return CLOSED
  return { ...s, query, index: query === s.query ? s.index : 0 }
}

/** Opens on "@" typed at the start of a block or after a space (not in code, not in an e-mail). */
function openOnAt(view: EditorView, from: number, to: number, text: string): boolean {
  if (text !== '@' || from !== to) return false
  const state = view.state
  const type = state.schema.nodes['mention']
  const $pos = state.doc.resolve(from)
  if (!type || !$pos.parent.inlineContent || $pos.parent.type.spec.code) return false
  if (!$pos.parent.type.canContain(type)) return false
  if ($pos.marks().some((m) => m.type.name === 'code')) return false
  const before = $pos.parent.textBetween(
    Math.max(0, $pos.parentOffset - 1),
    $pos.parentOffset,
    '',
    '￼',
  )
  if (before && !/\s/.test(before)) return false
  const tr = state.tr.insertText('@', from, to)
  view.dispatch(tr.setMeta(mentionKey, { ...CLOSED, active: true, from, resultsFor: null }))
  return true
}

export function closeMention(tr: Transaction): Transaction {
  return tr.setMeta(mentionKey, CLOSED)
}

/** Replaces "@query" with the mention and a space, cursor after it. */
export function chooseMention(view: EditorView, item: MentionItem): boolean {
  const s = getMentionState(view.state)
  const type = view.state.schema.nodes['mention']
  if (!s.active || !type) return false
  const { schema } = view.state
  const head = view.state.selection.head
  const marks = view.state.doc.resolve(s.from).marks()
  const node = type.create({ id: item.id, label: item.label }, null, marks)
  const tr = view.state.tr.replaceWith(s.from, head, [node, schema.text(' ', marks)])
  // its own undo step: Ctrl+Z right after brings the typed "@query" back
  view.dispatch(closeMention(tr).setMeta(CLOSE_HISTORY, true).scrollIntoView())
  view.focus()
  return true
}

export function mentionPlugin(options: MentionMenuOptions): Plugin<MentionState> {
  const props: ViewPluginProps = {
    handleTextInput: openOnAt,
    pluginView: (view) => mentionMenuView(view, options),
  }
  return new Plugin<MentionState>({
    key: mentionKey,
    state: {
      init: () => CLOSED,
      apply(tr, value, _old, state) {
        const meta = tr.getMeta<MentionState>(mentionKey)
        if (meta) return meta
        if (!value.active || (!tr.docChanged && !tr.selectionSet)) return value
        return stillValid(state, { ...value, from: tr.mapping.map(value.from, -1) })
      },
    },
    props: { ...props },
  })
}
