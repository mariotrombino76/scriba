import { Plugin, type Node, type NodeJSON, type Schema } from '@scriba/core'
import type { ToolbarButton } from '@scriba/ui'
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

/** Puts the draft in the editor (one undoable change). Returns false when there is none. */
export function restoreDraft(view: EditorView, options: AutosaveOptions): boolean {
  const draft = readDraft(view.state.schema, options)
  if (!draft || draft.doc.eq(view.state.doc)) return false
  view.dispatch(
    view.state.tr.replaceWith(0, view.state.doc.content.size, draft.doc.content).scrollIntoView(),
  )
  return true
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
      return {
        update(v, prev) {
          if (v.state.doc === prev.doc) return
          clearTimeout(timer)
          timer = setTimeout(save, options.delay ?? 2000)
        },
        destroy() {
          if (timer) save() // do not lose the last changes when the editor closes
          clearTimeout(timer)
        },
      }
    },
  }
  return new Plugin({ props: { ...props } })
}

/** "Restore last draft" (File menu): enabled when a different draft is saved. */
export function restoreDraftItem(options: AutosaveOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'restore-draft',
    label: (t) => t('autosave.restore'),
    command: (state) => {
      const draft = readDraft(state.schema, options)
      return !!draft && !draft.doc.eq(state.doc)
    },
    run: (view) => {
      restoreDraft(view, options)
      view.focus() // back to writing (and Ctrl+Z undoes the restore)
    },
  }
}
