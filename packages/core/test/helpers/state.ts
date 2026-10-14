import {
  EditorState,
  NodeSelection,
  TextSelection,
  type Command,
  type Node,
  type Plugin,
} from '../../src/index.js'

/** State with a text selection (anchor, head) or a cursor. */
export function stateAt(
  doc: Node,
  anchor: number,
  head = anchor,
  plugins: Plugin[] = [],
): EditorState {
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head), plugins })
}

export function nodeStateAt(doc: Node, pos: number): EditorState {
  return EditorState.create({ doc, selection: NodeSelection.create(doc, pos) })
}

/** Runs a command; returns the resulting state, or null if it did not apply. */
export function run(state: EditorState, cmd: Command): EditorState | null {
  let next: EditorState | null = null
  const ok = cmd(state, (tr) => (next = state.apply(tr)))
  if (!ok) return null
  return next ?? state
}
