import type * as Y from 'yjs'
import { ADD_TO_HISTORY, Plugin, PluginKey, type Node, type Transaction } from '@scriba/core'
import type { EditorView, PluginView, ViewPluginProps } from '@scriba/view'
import { diffEnd, diffStart } from './diff.js'
import { docFromY, updateFragment, writeDoc } from './mapping.js'

export interface YBindingOptions {
  ydoc: Y.Doc
  /** Name of the shared XML fragment (default "scriba"). */
  field?: string
  /**
   * With a server: resolves when the first sync is done (`provider.synced`).
   * Until then nothing is written to Yjs (the server's content wins); then the
   * editor's own content is shared only if the server's document is empty.
   */
  synced?: Promise<unknown>
}

/** Meta on transactions that come from other users (not undoable here, not sent back). */
export const REMOTE_META = 'collabRemote'

export const yBindingKey = new PluginKey('yBinding')

/**
 * Keeps the editor and a Yjs document in sync. Local edits become minimal
 * Yjs operations (two people typing in the same paragraph both keep their
 * text); remote edits are rebuilt through the schema (invalid content is
 * dropped, §5.8) and applied as one step outside the undo history, so Ctrl+Z
 * only undoes your own changes.
 */
export function yBinding(options: YBindingOptions): Plugin {
  const props: ViewPluginProps = { pluginView: (view) => bindingView(view, options) }
  return new Plugin({ key: yBindingKey, props: { ...props } })
}

/** Replaces the differing part of the document with the remote version (one step). */
export function remoteTransaction(view: EditorView, next: Node): Transaction | null {
  const current = view.state.doc
  if (next.eq(current)) return null
  const tr = view.state.tr
  const start = diffStart(current.content, next.content)
  const end = diffEnd(current.content, next.content)
  if (start === null || !end) return null
  let { a: endA, b: endB } = end
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) {
    endA += overlap
    endB += overlap
  }
  try {
    tr.replace(start, endA, next.slice(start, endB))
  } catch {
    tr.replaceWith(0, current.content.size, next.content) // fallback: the whole content
  }
  return tr.setMeta(ADD_TO_HISTORY, false).setMeta(REMOTE_META, true)
}

function bindingView(
  view: EditorView,
  { ydoc, field = 'scriba', synced }: YBindingOptions,
): PluginView {
  const fragment = ydoc.getXmlFragment(field)
  const origin = { binding: true } // our own Yjs transactions
  let applying = false

  const applyRemote = () => {
    const next = docFromY(view.state.schema, fragment)
    const tr = remoteTransaction(view, next)
    if (!tr) return
    applying = true
    try {
      view.dispatch(tr)
    } finally {
      applying = false
    }
    // plugins may have normalized the result (e.g. a rectangular table): share that too
    if (!view.state.doc.eq(next))
      ydoc.transact(() => updateFragment(fragment, next, view.state.doc), origin)
  }

  let ready = !synced
  const start = () => {
    ready = true
    if (fragment.length === 0) ydoc.transact(() => writeDoc(fragment, view.state.doc), origin)
    else applyRemote()
  }
  if (synced) void synced.then(start)
  else start()

  const observer = (_events: unknown, transaction: Y.Transaction) => {
    if (transaction.origin !== origin && ready) applyRemote()
  }
  fragment.observeDeep(observer)

  return {
    update(v, prev) {
      if (applying || !ready || prev.doc === v.state.doc) return
      ydoc.transact(() => updateFragment(fragment, prev.doc, v.state.doc), origin)
    },
    destroy() {
      fragment.unobserveDeep(observer)
    },
  }
}
