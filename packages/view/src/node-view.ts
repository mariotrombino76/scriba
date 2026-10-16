import type { Node } from '@scriba/core'
import type { EditorView } from './view.js'

/**
 * Custom rendering of an atomic node (e.g. a component of your UI framework).
 * The view owns the position of `dom`; what is inside is yours: the editor
 * ignores DOM changes there and leaves form controls (inputs, buttons…) to
 * the browser. The HTML output still comes from the node's `toHTML`.
 */
export interface NodeView {
  /** The node's element (made non-editable for the editor). */
  readonly dom: HTMLElement
  /**
   * A new version of the node (e.g. changed attributes): return true when
   * this view showed it, false to have it rendered again from scratch.
   */
  update?(node: Node): boolean
  /** The node became / stopped being the selected node. */
  selectNode?(): void
  deselectNode?(): void
  /**
   * Events inside `dom` the editor must leave alone (default: events from
   * form controls and editable fields).
   */
  stopEvent?(event: Event): boolean
  /** The node left the document (or the view was destroyed). */
  destroy?(): void
}

/** `getPos()` is the node's current position, or null once it is gone. */
export type NodeViewFactory = (
  node: Node,
  view: EditorView,
  getPos: () => number | null,
) => NodeView

/** Marks the element of a node view (CSS hook, and how events are routed). */
export const NODE_VIEW_ATTR = 'data-scriba-node-view'

const CONTROLS = 'input, textarea, select, button, [contenteditable="true"]'

/** Default `stopEvent`: events from form controls and editable fields inside the node. */
export function defaultStopEvent(event: Event, dom: HTMLElement): boolean {
  const target = event.target
  if (!(target instanceof Element) || target === dom) return false
  const control = target.closest(CONTROLS)
  return !!control && dom.contains(control)
}
