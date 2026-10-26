import {
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type KeyBindings,
  type Node,
} from '@scriba/core'
import type { ToolbarButton } from '@scriba/ui'
import type { EditorView } from '@scriba/view'

export interface SaveOptions {
  /**
   * Your save function (e.g. `fetch` to your API with `serializeHTML(doc)`).
   * The editor waits for its promise; while it runs, saving again is off.
   * Your server must still sanitize what it receives (`@scriba/sanitize-server`).
   */
  save: (doc: Node) => void | Promise<void>
  /** Called when `save` throws or rejects (the document stays "not saved"). */
  onError?: (error: unknown) => void
}

interface SaveState {
  /** The document as last saved (or loaded). */
  readonly saved: Node
  readonly saving: boolean
}

export const saveKey = new PluginKey<SaveState>('save')

/** Remembers the last saved document, to know whether there is something to save. */
export function savePlugin(): Plugin<SaveState> {
  return new Plugin<SaveState>({
    key: saveKey,
    state: {
      init: (_config, state) => ({ saved: state.doc, saving: false }),
      apply: (tr, value) => tr.getMeta<SaveState>(saveKey) ?? value,
    },
  })
}

/** True when the document differs from the last saved one. */
export function isDirty(state: EditorState): boolean {
  const s = saveKey.getState(state)
  return !!s && !state.doc.eq(s.saved)
}

/** True while your save function runs. */
export function isSaving(state: EditorState): boolean {
  return !!saveKey.getState(state)?.saving
}

/**
 * Marks the current document as saved (e.g. after loading a new one, or after
 * saving through your own code).
 */
export function markSaved(view: EditorView): void {
  if (!saveKey.getState(view.state)) return
  view.dispatch(view.state.tr.setMeta(saveKey, { saved: view.state.doc, saving: false }))
}

/** Saves the document with your function; possible only when something changed. */
export function saveCommand(options: SaveOptions): Command {
  return (state, dispatch, view) => {
    const s = saveKey.getState(state)
    if (!s || s.saving || state.doc.eq(s.saved)) return false
    if (!dispatch) return true
    if (!view) return false
    const editor = view as EditorView
    const doc = state.doc
    dispatch(state.tr.setMeta(saveKey, { saved: s.saved, saving: true }))
    const done = (saved: Node) => {
      const now = saveKey.getState(editor.state)
      if (now) editor.dispatch(editor.state.tr.setMeta(saveKey, { saved, saving: false }))
    }
    Promise.resolve()
      .then(() => options.save(doc))
      .then(
        () => done(doc),
        (error: unknown) => {
          done(s.saved)
          options.onError?.(error)
        },
      )
    return true
  }
}

/** Ctrl/Cmd+S saves (give it a higher priority than the File menu's download). */
export function saveKeymap(options: SaveOptions): KeyBindings {
  const save = saveCommand(options)
  // Ctrl+S never opens the browser's "save page" dialog, even with nothing to save
  return { 'Mod-s': (state, dispatch, view) => save(state, dispatch, view) || !!view }
}

/** Toolbar button "Save": enabled when there are unsaved changes. */
export function saveItem(options: SaveOptions): ToolbarButton {
  return {
    type: 'button',
    id: 'save',
    icon: 'save',
    label: (t) => t('save.label'),
    shortcut: 'Mod-s',
    command: saveCommand(options),
  }
}
