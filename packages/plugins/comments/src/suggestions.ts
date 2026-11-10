import {
  ADD_TO_HISTORY,
  Fragment,
  Plugin,
  PluginKey,
  ReplaceStep,
  TextSelection,
  historyKey,
  type EditorState,
  type Mark,
  type MarkSpec,
  type MarkType,
  type Node,
  type Transaction,
} from '@scriba-editor/core'
import type { Translate } from '@scriba-editor/i18n'
import type { EditorView, PluginView, ViewPluginProps } from '@scriba-editor/view'
import type { CommentStore } from './store.js'

const ID = /^[\w-]{1,64}$/
const idAttr = { id: { validate: (v: unknown) => typeof v === 'string' && ID.test(v) } }

/**
 * Suggestion marks (track changes): text proposed for insertion or deletion.
 * Like comment anchors they hold only an id (the author is in the store),
 * are not exported to HTML (resolve them first: `resolveAllSuggestions`) and
 * cannot be pasted in.
 */
export const suggestionMarks = {
  suggest_insert: {
    attrs: idAttr,
    excludes: 'suggest_insert suggest_delete',
    serialize: false,
    toHTML: (mark: Mark) => [
      'ins',
      { class: 'scriba-suggest-insert', 'data-suggestion': mark.attrs['id'] as string },
      0,
    ],
  },
  suggest_delete: {
    attrs: idAttr,
    excludes: 'suggest_insert suggest_delete',
    inclusive: false,
    serialize: false,
    toHTML: (mark: Mark) => [
      'del',
      { class: 'scriba-suggest-delete', 'data-suggestion': mark.attrs['id'] as string },
      0,
    ],
  },
} satisfies Record<string, MarkSpec>

/** Meta on our own transactions (accept/reject, id updates): never transformed or blocked. */
export const SUGGEST_META = 'suggestion'

interface SuggestState {
  enabled: boolean
}

export const suggestKey = new PluginKey<SuggestState>('suggestions')

export function suggestingEnabled(state: EditorState): boolean {
  return suggestKey.getState(state)?.enabled ?? false
}

/** Switches suggestion mode on or off. */
export function setSuggesting(view: EditorView, enabled: boolean): void {
  view.dispatch(view.state.tr.setMeta(suggestKey, { enabled }))
}

/** A plain text edit inside one textblock (all that suggestion mode turns into proposals). */
function isTextEdit(tr: Transaction): boolean {
  return tr.steps.every((step, i) => {
    if (!(step instanceof ReplaceStep) || step.slice.openStart || step.slice.openEnd) return false
    let inline = true
    step.slice.content.forEach((n) => (inline &&= n.isInline))
    const doc = tr.docs[i]!
    return (
      inline &&
      doc.resolve(step.from).sameParent(doc.resolve(step.to)) &&
      doc.resolve(step.from).parent.inlineContent
    )
  })
}

/** Transactions typed or pasted by the user here (not ours, not remote, not appended, not undo/redo). */
function isUserEdit(tr: Transaction): boolean {
  return (
    tr.docChanged &&
    !tr.getMeta(SUGGEST_META) &&
    !tr.getMeta(historyKey) &&
    tr.getMeta(ADD_TO_HISTORY) !== false &&
    !tr.getMeta('appendedTransaction')
  )
}

/** Suggestion ids created here (until the store knows them, and after). */
interface Ids {
  own: Set<string>
  /** temporary id → id given by the store */
  real: Map<string, string>
}

function markOf(node: Node | null | undefined, type: MarkType): Mark | undefined {
  return node?.marks.find((m) => m.type === type)
}

/**
 * Suggestion mode: typed text becomes a proposed insertion; deleted text stays,
 * as a proposed deletion (deleting your own proposed text really removes it).
 * Formatting and structural changes are refused while it is on (`onBlocked`
 * explains why). Each proposal is a "suggestion" thread in the store, so its
 * author is set by the store / server (§5.8).
 */
export function suggestionsPlugin(options: {
  store: CommentStore
  /** For the default message when an edit is refused. */
  t?: Translate
  /** Called when an edit is refused (default: a polite screen reader message). */
  onBlocked?: () => void
}): Plugin<SuggestState> {
  const ids: Ids = { own: new Set(), real: new Map() }
  let announce: () => void = () => undefined
  let viewRef: EditorView | null = null
  const props: ViewPluginProps = {
    pluginView: (view): PluginView => {
      viewRef = view
      // polite message: "only text can be changed while suggesting"
      const region = view.document.createElement('p')
      region.className = 'scriba-visually-hidden'
      region.setAttribute('role', 'status')
      view.dom.after(region)
      announce = () => {
        region.textContent = ''
        const text = options.t ? options.t('suggest.blocked') : 'Not allowed while suggesting'
        setTimeout(() => (region.textContent = text), 50)
      }
      return {
        destroy: () => {
          viewRef = null
          region.remove()
        },
      }
    },
  }

  /** A new proposal id; the store is told (and its id replaces ours when it answers). */
  const newId = (): string => {
    const temp = `tmp-${Math.random().toString(36).slice(2, 10)}`
    ids.own.add(temp)
    // after this transaction: the store may notify listeners that dispatch
    void Promise.resolve()
      .then(() => options.store.createThread('suggestion', ''))
      .then(
        (thread) => {
          ids.own.add(thread.id)
          ids.real.set(temp, thread.id)
          if (viewRef) renameSuggestion(viewRef, temp, thread.id)
        },
        () => undefined,
      )
    return temp
  }
  const isOwn = (id: string) => {
    if (ids.own.has(id)) return true
    const t = options.store.threads().find((x) => x.id === id)
    return !!t && !!options.store.userId && t.author?.id === options.store.userId
  }

  return new Plugin<SuggestState>({
    key: suggestKey,
    state: {
      init: () => ({ enabled: false }),
      apply: (tr, value) => tr.getMeta<SuggestState>(suggestKey) ?? value,
    },
    props: { ...props },
    filterTransaction(tr, state) {
      if (!suggestingEnabled(state) || !isUserEdit(tr) || isTextEdit(tr)) return true
      // formatting, new blocks, joins…: not allowed while suggesting
      setTimeout(() => (options.onBlocked ?? announce)(), 0)
      return false
    },
    appendTransaction(trs, oldState, newState) {
      if (!suggestingEnabled(newState)) return null
      const schema = newState.schema
      const ins = schema.marks['suggest_insert']
      const del = schema.marks['suggest_delete']
      if (!ins || !del) return null
      const fix = newState.tr.setMeta(SUGGEST_META, true)
      let changed = false
      let cursor: number | null = null
      trs.forEach((tr, k) => {
        if (!isUserEdit(tr)) return
        const inserts = tr.steps.some((st) => (st as ReplaceStep).slice.size > 0)
        // struck text just put back: an insertion right after it is the same proposal (a replacement)
        let struck: { end: number; id: string; steps: number } | null = null
        // positions after step i of tr k → final document (later trs, then our fix)
        const later = trs.slice(k + 1)
        const toFinal = (pos: number, i: number, assoc: number) => {
          let p = tr.mapping.slice(i + 1).map(pos, assoc)
          for (const t of later) p = t.mapping.map(p, assoc)
          return fix.mapping.map(p, assoc)
        }
        tr.steps.forEach((step, i) => {
          const s = step as ReplaceStep
          const before = tr.docs[i]!
          const size = s.slice.size
          const at = toFinal(s.from, i, -1)
          // 1) inserted text → proposed insertion (joining your proposal right before it)
          if (size) {
            // after any struck text put back at the same place (deleted, then inserted)
            const start = toFinal(s.from, i, 1)
            const end = toFinal(s.from + size, i, 1)
            const prev = markOf(fix.doc.resolve(start).nodeBefore, ins)
            const replacing =
              struck && fix.mapping.slice(struck.steps).map(struck.end) === start ? struck.id : null
            const id =
              replacing ??
              (prev && isOwn(prev.attrs['id'] as string) ? (prev.attrs['id'] as string) : newId())
            fix.removeMark(start, end, del)
            fix.addMark(start, end, ins.create({ id }))
            changed = true
          }
          // 2) deleted text comes back as a proposed deletion (except your own proposed insertions)
          if (s.to > s.from) {
            const removed: Node[] = []
            before.slice(s.from, s.to).content.forEach((node) => {
              const insMark = markOf(node, ins)
              if (!(insMark && isOwn(insMark.attrs['id'] as string))) removed.push(node) // own proposals really go
            })
            if (removed.length) {
              const near =
                markOf(fix.doc.resolve(at).nodeBefore, del) ??
                markOf(fix.doc.resolve(at).nodeAfter, del)
              const id =
                near && isOwn(near.attrs['id'] as string) ? (near.attrs['id'] as string) : newId()
              const content = Fragment.fromArray(
                removed.map((node) =>
                  // already struck text keeps its proposal; the rest joins this one
                  markOf(node, del)
                    ? node
                    : node.mark(
                        del.create({ id }).addToSet(node.marks.filter((m) => m.type !== ins)),
                      ),
                ),
              )
              fix.insert(at, content)
              struck = { end: at + content.size, id, steps: fix.steps.length }
              changed = true
              // a pure deletion: Backspace leaves the cursor before the struck text, Delete after it
              if (!inserts) cursor = oldState.selection.head === s.to ? at : at + content.size
            }
          }
        })
      })
      if (!changed) return null
      if (cursor !== null) fix.setSelection(TextSelection.create(fix.doc, cursor))
      return fix
    },
  })
}

/** Replaces a temporary id with the store's id (not an undoable change). */
function renameSuggestion(view: EditorView, from: string, to: string): void {
  const tr = view.state.tr.setMeta(SUGGEST_META, true).setMeta(ADD_TO_HISTORY, false)
  for (const name of ['suggest_insert', 'suggest_delete']) {
    const type = view.state.schema.marks[name]
    if (!type) continue
    view.state.doc.descendants((node, pos) => {
      const m = node.isInline ? markOf(node, type) : undefined
      if (m?.attrs['id'] === from) {
        tr.removeMark(pos, pos + node.nodeSize, type)
        tr.addMark(pos, pos + node.nodeSize, type.create({ id: to }))
      }
      return true
    })
  }
  if (tr.docChanged) view.dispatch(tr)
}

/** One proposal: its id, kind(s) and text. */
export interface Suggestion {
  id: string
  inserted: string
  deleted: string
  from: number
}

/** The proposals in the document, in order. */
export function listSuggestions(doc: Node): Suggestion[] {
  const map = new Map<string, Suggestion>()
  doc.descendants((node, pos) => {
    if (!node.isInline) return true
    for (const m of node.marks) {
      const kind =
        m.type.name === 'suggest_insert'
          ? 'inserted'
          : m.type.name === 'suggest_delete'
            ? 'deleted'
            : null
      if (!kind) continue
      const id = m.attrs['id'] as string
      const s = map.get(id) ?? { id, inserted: '', deleted: '', from: pos }
      s[kind] += node.isText ? node.text : '￼'
      map.set(id, s)
    }
    return true
  })
  return [...map.values()]
}

/** Accepts or rejects one proposal (or all of them) in one undo step. */
export function resolveSuggestion(view: EditorView, id: string | null, accept: boolean): void {
  const state = view.state
  const ins = state.schema.marks['suggest_insert']
  const del = state.schema.marks['suggest_delete']
  if (!ins || !del) return
  const tr = state.tr.setMeta(SUGGEST_META, true)
  const ranges: { from: number; to: number; kind: 'ins' | 'del' }[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isInline) return true
    const i = markOf(node, ins)
    const d = markOf(node, del)
    if (i && (id === null || i.attrs['id'] === id))
      ranges.push({ from: pos, to: pos + node.nodeSize, kind: 'ins' })
    if (d && (id === null || d.attrs['id'] === id))
      ranges.push({ from: pos, to: pos + node.nodeSize, kind: 'del' })
    return true
  })
  // from the end, so positions stay valid
  for (const r of ranges.reverse()) {
    const removeText = (r.kind === 'ins') !== accept // reject an insertion, accept a deletion
    if (removeText) tr.delete(r.from, r.to)
    else tr.removeMark(r.from, r.to, r.kind === 'ins' ? ins : del)
  }
  if (tr.docChanged) view.dispatch(tr.scrollIntoView())
}

/** The document with every proposal accepted (or rejected), e.g. before exporting HTML. */
export function resolveAllSuggestions(state: EditorState, accept: boolean): Node {
  let doc = state.doc
  const ins = state.schema.marks['suggest_insert']
  const del = state.schema.marks['suggest_delete']
  if (!ins || !del) return doc
  const tr = state.tr
  const ranges: { from: number; to: number; kind: 'ins' | 'del' }[] = []
  doc.descendants((node, pos) => {
    if (markOf(node, ins)) ranges.push({ from: pos, to: pos + node.nodeSize, kind: 'ins' })
    if (markOf(node, del)) ranges.push({ from: pos, to: pos + node.nodeSize, kind: 'del' })
    return true
  })
  for (const r of ranges.reverse()) {
    if ((r.kind === 'ins') !== accept) tr.delete(r.from, r.to)
    else tr.removeMark(r.from, r.to, r.kind === 'ins' ? ins : del)
  }
  doc = tr.doc
  return doc
}
