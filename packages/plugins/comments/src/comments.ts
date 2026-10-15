import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Mark,
  type MarkSpec,
  type Node,
} from '@scriba/core'
import type { EditorView, InlineDecoration, PluginView, ViewPluginProps } from '@scriba/view'
import type { CommentStore, CommentThread } from './store.js'

const ID = /^[\w-]{1,64}$/

/**
 * The comment anchor: a mark holding only the thread id. It moves with the
 * text, is not written to the exported HTML and has no parse rule, so pasted
 * HTML can never create comments.
 */
export const commentMarks = {
  comment: {
    attrs: { id: { validate: (v: unknown) => typeof v === 'string' && ID.test(v) } },
    excludes: '', // several comments may cover the same text
    inclusive: false,
    serialize: false,
    toHTML: (mark: Mark) => [
      'span',
      { class: 'scriba-comment-anchor', 'data-comment': mark.attrs['id'] as string },
      0,
    ],
  },
} satisfies Record<string, MarkSpec>

export interface CommentsState {
  threads: readonly CommentThread[]
  /** The thread being looked at (its text is highlighted more). */
  active: string | null
  /** Ranges waiting for the store to create their thread (mapped through edits). */
  pending: Readonly<Record<string, { from: number; to: number }>>
}

export const commentsKey = new PluginKey<CommentsState>('comments')

export function getComments(state: EditorState): CommentsState {
  return commentsKey.getState(state) ?? { threads: [], active: null, pending: {} }
}

/** Where a thread's anchor is in the document (first to last marked text), or null. */
export function threadRange(doc: Node, id: string): { from: number; to: number } | null {
  let from = -1
  let to = -1
  doc.descendants((node, pos) => {
    if (
      node.isInline &&
      node.marks.some((m) => m.type.name === 'comment' && m.attrs['id'] === id)
    ) {
      if (from < 0) from = pos
      to = pos + node.nodeSize
    }
    return true
  })
  return from < 0 ? null : { from, to }
}

/** Ids of the comments at a position (innermost text), for "click on highlighted text". */
export function commentsAt(state: EditorState, pos: number): string[] {
  const $pos = state.doc.resolve(pos)
  const marks = [...($pos.nodeAfter?.marks ?? []), ...($pos.nodeBefore?.marks ?? [])]
  return [
    ...new Set(marks.filter((m) => m.type.name === 'comment').map((m) => m.attrs['id'] as string)),
  ]
}

function decorationsFor(state: EditorState): InlineDecoration[] {
  const { threads, active } = getComments(state)
  const open = new Set(threads.filter((t) => !t.resolved && t.kind === 'comment').map((t) => t.id))
  if (!open.size) return []
  const out: InlineDecoration[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isInline) return true
    for (const m of node.marks) {
      if (m.type.name !== 'comment') continue
      const id = m.attrs['id'] as string
      if (!open.has(id)) continue
      out.push({
        from: pos,
        to: pos + node.nodeSize,
        class: id === active ? 'scriba-comment scriba-comment-active' : 'scriba-comment',
      })
    }
    return true
  })
  return out
}

/**
 * Comments: keeps the store's threads in the editor state (highlights only
 * open threads; the active one stands out). Clicking or moving into
 * commented text makes its thread active.
 */
export function commentsPlugin(store: CommentStore): Plugin<CommentsState> {
  let cache: { doc: Node; s: CommentsState; decos: InlineDecoration[] } | null = null
  const props: ViewPluginProps = { pluginView: (view) => syncView(view, store) }
  return new Plugin<CommentsState>({
    key: commentsKey,
    state: {
      init: () => ({ threads: store.threads(), active: null, pending: {} }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta<Partial<CommentsState>>(commentsKey)
        let next = value
        if (tr.docChanged && Object.keys(value.pending).length) {
          const pending: Record<string, { from: number; to: number }> = {}
          for (const [k, r] of Object.entries(value.pending))
            pending[k] = { from: tr.mapping.map(r.from, 1), to: tr.mapping.map(r.to, -1) }
          next = { ...next, pending }
        }
        if (meta) next = { ...next, ...meta }
        if (tr.selectionSet && !(meta && 'active' in meta)) {
          // the cursor in commented text activates its thread; elsewhere none is active
          const ids = commentsAt(state, state.selection.head)
          const open =
            ids.find((id) => next.threads.some((t) => t.id === id && !t.resolved)) ?? null
          if (open !== next.active) next = { ...next, active: open }
        }
        return next
      },
    },
    props: {
      ...props,
      decorations(state: EditorState): InlineDecoration[] {
        const s = getComments(state)
        if (cache && cache.doc === state.doc && cache.s === s) return cache.decos
        const decos = decorationsFor(state)
        cache = { doc: state.doc, s, decos }
        return decos
      },
    },
  })
}

/** Threads from the store into the editor state, whenever they change. */
function syncView(view: EditorView, store: CommentStore): PluginView {
  const unsubscribe = store.subscribe(() => {
    view.dispatch(view.state.tr.setMeta(commentsKey, { threads: store.threads() }))
  })
  return { destroy: unsubscribe }
}

let tokens = 0

/** Starts a thread on the selected text (the store gives the id; the range follows edits meanwhile). */
export async function addComment(
  view: EditorView,
  store: CommentStore,
  text: string,
): Promise<CommentThread | null> {
  const type = view.state.schema.marks['comment']
  const { from, to, empty } = view.state.selection
  if (!type || empty) return null
  const token = `t${++tokens}`
  const withPending = (add: boolean) => {
    const rest = Object.entries(getComments(view.state).pending).filter(([k]) => k !== token)
    return Object.fromEntries(add ? [...rest, [token, { from, to }]] : rest)
  }
  view.dispatch(view.state.tr.setMeta(commentsKey, { pending: withPending(true) }))
  let thread: CommentThread
  try {
    thread = await store.createThread('comment', text)
  } catch (e) {
    view.dispatch(view.state.tr.setMeta(commentsKey, { pending: withPending(false) }))
    throw e
  }
  const range = getComments(view.state).pending[token]
  const tr = view.state.tr.setMeta(commentsKey, {
    threads: store.threads(),
    active: thread.id,
    pending: withPending(false),
  })
  if (range && range.to > range.from)
    tr.addMark(range.from, range.to, type.create({ id: thread.id }))
  view.dispatch(tr)
  return thread
}

/** Deletes a thread and its anchor. */
export async function deleteThread(
  view: EditorView,
  store: CommentStore,
  id: string,
): Promise<void> {
  await store.deleteThread(id)
  removeAnchor(view, id)
}

/** Removes the anchor marks of a thread (e.g. a suggestion accepted elsewhere). */
export function removeAnchor(view: EditorView, id: string): void {
  const type = view.state.schema.marks['comment']
  const range = type && threadRange(view.state.doc, id)
  if (!type || !range) return
  view.dispatch(view.state.tr.removeMark(range.from, range.to, type.create({ id })))
}

/** Selects a thread's text in the editor and makes it active. */
export function focusThread(view: EditorView, id: string): void {
  const range = threadRange(view.state.doc, id)
  const tr = view.state.tr.setMeta(commentsKey, { active: id })
  if (range) tr.setSelection(TextSelection.create(tr.doc, range.from, range.to)).scrollIntoView()
  view.dispatch(tr)
}
