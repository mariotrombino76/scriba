import type { EditorState, Fragment, Node } from '@scriba-editor/core'
import type { EditorView } from './view.js'

/**
 * View-side plugin props (all optional). The view looks them up in
 * `plugin.props` by name; plugins stay free of view internals.
 */
export interface ViewPluginProps {
  /** A helper living next to the editor (overlays, resize handles…), kept in sync with the state. */
  pluginView?: (view: EditorView) => PluginView
  /** Something was dropped at document position `pos` (null outside content). Return true if handled. */
  handleDrop?: (view: EditorView, event: DragEvent, pos: number | null) => boolean
  /** Files were pasted (e.g. a screenshot). Return true if handled. */
  handlePasteFiles?: (view: EditorView, files: readonly File[]) => boolean
  /**
   * Pasted content, already parsed through the schema (safe), about to be
   * inserted at the selection. Return true if handled (e.g. a table pasted
   * into a table fills its cells).
   */
  handlePasteContent?: (view: EditorView, content: Fragment) => boolean
  /**
   * Text typed by the user (not pasted, not IME) about to replace [from, to).
   * Return true when handled (e.g. Markdown input rules: `# ` → heading).
   */
  handleTextInput?: (view: EditorView, from: number, to: number, text: string) => boolean
  /**
   * The selection (not empty) is about to be deleted by a cut or by a delete
   * the browser sends as an input event. Return true when handled (e.g.
   * protected blocks deleted around, not refused as a whole).
   */
  handleDeleteSelection?: (view: EditorView) => boolean
  /** A node (e.g. an image) was double-clicked. Return true if handled. */
  handleDoubleClickNode?: (view: EditorView, pos: number, node: Node) => boolean
}

export interface PluginView {
  update?(view: EditorView, prevState: EditorState): void
  destroy?(): void
}

/** Calls the first plugin prop of that name that returns true. */
export function someProp<K extends keyof ViewPluginProps>(
  state: EditorState,
  name: K,
  call: (prop: NonNullable<ViewPluginProps[K]>) => boolean,
): boolean {
  for (const plugin of state.plugins) {
    const prop = plugin.props[name] as ViewPluginProps[K] | undefined
    if (typeof prop === 'function' && call(prop as NonNullable<ViewPluginProps[K]>)) return true
  }
  return false
}
