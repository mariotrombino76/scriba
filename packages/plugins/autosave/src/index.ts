import {
  Plugin,
  type EditorState,
  type Node,
  type NodeJSON,
  type Schema,
  type Transaction,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { openDialog, type ToolbarButton } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'

/** Where drafts are kept: `localStorage` by default (or any object with these methods). */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface AutosaveOptions {
  /** One key per document, e.g. `scriba:nota-42` (drafts of different documents never mix). */
  key: string
  /** Wait after the last change before saving (ms, default 2000). */
  delay?: number
  /** Default: `localStorage` (when the browser allows it). */
  storage?: DraftStorage | null
  /** Largest draft kept (characters of JSON, default 2 000 000): bigger ones are not saved. */
  maxLength?: number
}

interface StoredDraft {
  v: 1
  savedAt: number
  doc: NodeJSON
}

function storageOf(options: AutosaveOptions): DraftStorage | null {
  if (options.storage !== undefined) return options.storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // storage blocked (privacy settings, sandboxed frames)
  }
}

/**
 * The saved draft, validated against the schema (`nodeFromJSON`): the browser storage
 * is untrusted input, other scripts of the page may have written it. Null when there is
 * none or it is not valid.
 */
export function readDraft(
  schema: Schema,
  options: AutosaveOptions,
): { doc: Node; savedAt: Date } | null {
  try {
    const raw = storageOf(options)?.getItem(options.key)
    if (!raw || raw.length > (options.maxLength ?? 2_000_000)) return null
    const data = JSON.parse(raw) as StoredDraft
    if (data?.v !== 1 || typeof data.savedAt !== 'number') return null
    return { doc: schema.nodeFromJSON(data.doc), savedAt: new Date(data.savedAt) }
  } catch {
    return null
  }
}

/** Forgets the draft: call it once the document is really saved (and on logout). */
export function clearDraft(options: AutosaveOptions): void {
  try {
    storageOf(options)?.removeItem(options.key)
  } catch {
    // nothing to do
  }
}

/**
 * The change from the current document to `draft`, touching only the blocks
 * that differ: the same blocks at the start and at the end are kept, and when
 * the middle has as many blocks on both sides, each run of different blocks is
 * replaced on its own. So an unchanged block (e.g. a protected one) is never
 * deleted and written again. Null when they are equal.
 */
export function draftTransaction(state: EditorState, draft: Node): Transaction | null {
  const doc = state.doc
  if (draft.eq(doc)) return null
  const a = doc.content
  const b = draft.content
  let head = 0
  while (head < a.childCount && head < b.childCount && a.child(head).eq(b.child(head))) head++
  let tail = 0
  while (
    tail < a.childCount - head &&
    tail < b.childCount - head &&
    a.child(a.childCount - 1 - tail).eq(b.child(b.childCount - 1 - tail))
  )
    tail++
  const starts: number[] = [] // position of each block of the current document
  let pos = 0
  for (let i = 0; i < a.childCount; i++) {
    starts.push(pos)
    pos += a.child(i).nodeSize
  }
  starts.push(pos)
  const runs: { from: number; to: number; nodes: Node[] }[] = []
  if (a.childCount === b.childCount) {
    for (let i = head; i < a.childCount - tail; i++) {
      if (a.child(i).eq(b.child(i))) continue
      const last = runs[runs.length - 1]
      if (last && last.to === starts[i]) {
        last.to = starts[i + 1]!
        last.nodes.push(b.child(i))
      } else runs.push({ from: starts[i]!, to: starts[i + 1]!, nodes: [b.child(i)] })
    }
  } else {
    const nodes: Node[] = []
    for (let i = head; i < b.childCount - tail; i++) nodes.push(b.child(i))
    runs.push({ from: starts[head]!, to: starts[a.childCount - tail]!, nodes })
  }
  const tr = state.tr
  // from the end: the positions of the earlier runs do not move
  for (const run of runs.reverse()) tr.replaceWith(run.from, run.to, run.nodes)
  return tr.scrollIntoView()
}

/**
 * Puts the draft in the editor (one undoable change). Returns false when there
 * is none, or when a plugin refused the change (e.g. the draft changes a
 * protected block).
 */
export function restoreDraft(view: EditorView, options: AutosaveOptions): boolean {
  const draft = readDraft(view.state.schema, options)
  const tr = draft && draftTransaction(view.state, draft.doc)
  if (!tr) return false
  const before = view.state
  view.dispatch(tr)
  return view.state !== before
}

/**
 * Saves a draft of the document in the browser while the user writes (like TinyMCE's
 * autosave): after the first change only, `delay` ms after the last one. The content
 * stays on this device, unencrypted: enable it only where that is acceptable.
 */
export function autosave(options: AutosaveOptions): Plugin {
  const props: ViewPluginProps = {
    pluginView(view) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let saved = view.state.doc // the document as opened: not a draft
      const save = () => {
        timer = undefined
        if (view.state.doc === saved) return
        saved = view.state.doc
        const data: StoredDraft = { v: 1, savedAt: Date.now(), doc: saved.toJSON() }
        const json = JSON.stringify(data)
        if (json.length > (options.maxLength ?? 2_000_000)) return
        try {
          storageOf(options)?.setItem(options.key, json)
        } catch {
          // full or blocked storage: the editor keeps working
        }
      }
      // leaving the page (reload, closing the tab) or hiding it (another tab, phone
      // locked): the changes waiting for the delay are saved now, not lost
      const flush = () => {
        if (!timer) return
        clearTimeout(timer)
        save()
      }
      const onVisibility = () => view.document.visibilityState === 'hidden' && flush()
      const win = view.document.defaultView
      win?.addEventListener('pagehide', flush)
      view.document.addEventListener('visibilitychange', onVisibility)
      return {
        update(v, prev) {
          if (v.state.doc === prev.doc) return
          clearTimeout(timer)
          timer = setTimeout(save, options.delay ?? 2000)
        },
        destroy() {
          flush() // do not lose the last changes when the editor closes
          win?.removeEventListener('pagehide', flush)
          view.document.removeEventListener('visibilitychange', onVisibility)
        },
      }
    },
  }
  return new Plugin({ props: { ...props } })
}

/** Says why the draft could not be restored (instead of doing nothing). */
function refuseRestore(view: EditorView, t: Translate): void {
  const handle = openDialog(view.document, {
    title: t('autosave.refusedTitle'),
    returnFocus: () => view.focus(),
    build(form, handle) {
      const doc = view.document
      const text = doc.createElement('p')
      text.textContent = t('autosave.refused')
      const actions = doc.createElement('div')
      actions.className = 'scriba-dialog-actions'
      const close = doc.createElement('button')
      close.type = 'submit'
      close.textContent = t('autosave.close')
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        handle.close()
      })
      actions.append(close)
      form.append(text, actions)
    },
  })
  handle.form.querySelector('button')?.focus()
}

/**
 * "Restore last draft" (File menu): enabled when a different draft is saved.
 * With `t`, a refused restore (e.g. the draft changes a protected block) is
 * explained in a dialog.
 */
export function restoreDraftItem(options: AutosaveOptions, t?: Translate): ToolbarButton {
  return {
    type: 'button',
    id: 'restore-draft',
    label: (t) => t('autosave.restore'),
    command: (state) => {
      const draft = readDraft(state.schema, options)
      return !!draft && !draft.doc.eq(state.doc)
    },
    run: (view) => {
      if (!restoreDraft(view, options) && t && readDraft(view.state.schema, options))
        return refuseRestore(view, t)
      view.focus() // back to writing (and Ctrl+Z undoes the restore)
    },
  }
}
