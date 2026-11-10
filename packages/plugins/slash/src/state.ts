import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { IconName } from '@scriba-editor/ui'
import type { EditorView, ViewPluginProps } from '@scriba-editor/view'
import { slashMenuView } from './menu.js'

/** One entry of the slash menu. */
export interface SlashItem {
  id: string
  label: (t: Translate) => string
  /** Extra words that find it (e.g. "h1", "title" for a heading). */
  keywords?: readonly string[]
  icon?: IconName
  /** What it does (after the "/query" text is removed)… */
  command?: Command
  /** …or an action needing the view (e.g. opening a dialog). */
  run?: (view: EditorView) => void
}

export interface SlashState {
  active: boolean
  /** Position of the "/" that opened the menu. */
  from: number
  query: string
  /** Highlighted entry among the filtered ones. */
  index: number
}

export const slashKey = new PluginKey<SlashState>('slash')

const CLOSED: SlashState = { active: false, from: 0, query: '', index: 0 }
const MAX_QUERY = 40

export function getSlashState(state: EditorState): SlashState {
  return slashKey.getState(state) ?? CLOSED
}

/** Lowercase without accents ("Città" → "citta"). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Entries matching the query: every word in the label or keywords; label prefixes first. */
export function filterItems(items: readonly SlashItem[], query: string, t: Translate): SlashItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...items]
  const scored: [number, SlashItem][] = []
  for (const item of items) {
    const label = fold(item.label(t))
    const hay = `${label} ${(item.keywords ?? []).map(fold).join(' ')}`
    if (!words.every((w) => hay.includes(w))) continue
    scored.push([label.startsWith(words[0]!) ? 0 : 1, item])
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, item]) => item)
}

/** The "/query" text still there and the cursor right after it? Otherwise the menu closes. */
function stillValid(state: EditorState, s: SlashState): SlashState {
  const { selection, doc } = state
  if (!selection.empty || s.from >= doc.content.size) return CLOSED
  const $from = doc.resolve(s.from)
  const head = selection.head
  if (head <= s.from || !$from.sameParent(selection.$head)) return CLOSED
  if (doc.textBetween(s.from, s.from + 1) !== '/') return CLOSED
  const query = doc.textBetween(s.from + 1, head, '\n', '\n')
  if (query.includes('\n') || query.length > MAX_QUERY) return CLOSED
  return { ...s, query, index: query === s.query ? s.index : 0 }
}

/** Opens on "/" typed at the start of a block or after a space (not in code). */
function openOnSlash(view: EditorView, from: number, to: number, text: string): boolean {
  if (text !== '/' || from !== to) return false
  const $pos = view.state.doc.resolve(from)
  if (!$pos.parent.inlineContent || $pos.parent.type.spec.code) return false
  if ($pos.marks().some((m) => m.type.name === 'code')) return false
  const before = $pos.parent.textBetween(
    Math.max(0, $pos.parentOffset - 1),
    $pos.parentOffset,
    '',
    '￼',
  )
  if (before && !/\s/.test(before)) return false
  const tr = view.state.tr.insertText('/', from, to)
  view.dispatch(
    tr.setMeta(slashKey, { active: true, from, query: '', index: 0 } satisfies SlashState),
  )
  return true
}

export function closeSlash(tr: Transaction): Transaction {
  return tr.setMeta(slashKey, CLOSED)
}

/** Removes "/query" and runs the entry. */
export function chooseItem(view: EditorView, item: SlashItem): void {
  const s = getSlashState(view.state)
  if (!s.active) return
  const tr = closeSlash(view.state.tr.delete(s.from, view.state.selection.head))
  view.dispatch(tr)
  if (item.command) item.command(view.state, (t) => view.dispatch(t.scrollIntoView()), view)
  else item.run?.(view)
  view.focus()
}

export function slashPlugin(items: readonly SlashItem[], t: Translate): Plugin<SlashState> {
  const props: ViewPluginProps = {
    handleTextInput: openOnSlash,
    pluginView: (view) => slashMenuView(view, items, t),
  }
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => CLOSED,
      apply(tr, value, _old, state) {
        const meta = tr.getMeta<SlashState>(slashKey)
        if (meta) return meta
        if (!value.active || (!tr.docChanged && !tr.selectionSet)) return value
        return stillValid(state, { ...value, from: tr.mapping.map(value.from, -1) })
      },
    },
    props: { ...props },
  })
}
