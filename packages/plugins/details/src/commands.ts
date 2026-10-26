import {
  blockRange,
  canReplace,
  Fragment,
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
  type Node,
  type NodeType,
  type Schema,
} from '@scriba/core'

function types(schema: Schema): { details: NodeType; summary: NodeType } {
  const details = schema.nodes['details']
  const summary = schema.nodes['details_summary']
  if (!details || !summary)
    throw new RangeError('The schema has no "details" node (add detailsNodes)')
  return { details, summary }
}

/** The collapsible section around the selection (or selected), with its position. */
export function findDetails(state: EditorState): { node: Node; pos: number } | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'details')
    return { node: sel.node, pos: sel.from }
  const { $from } = sel
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'details') return { node: $from.node(d), pos: $from.before(d) }
  }
  return null
}

/**
 * Puts the selected blocks in a new open section with an empty title, and
 * the cursor in the title.
 */
export function insertDetails(schema: Schema): Command {
  const { details, summary } = types(schema)
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    if ($from.parent.type === summary) return false
    const range = blockRange($from, $to)
    if (!range) return false
    const blocks: Node[] = []
    for (let i = range.startIndex; i < range.endIndex; i++) blocks.push(range.parent.child(i))
    const content = Fragment.fromArray([summary.create(), ...blocks])
    // e.g. table rows of a cell selection: not blocks
    if (!details.validContent(content)) return false
    const node = details.create({ open: true }, content)
    if (!canReplace(range.parent, range.startIndex, range.endIndex, Fragment.from(node)))
      return false
    if (dispatch) {
      const tr = state.tr.replaceWith(range.start, range.end, node)
      tr.setSelection(TextSelection.create(tr.doc, range.start + 2))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Takes the content out of the section: its title becomes a paragraph (if not empty). */
export function removeDetails(schema: Schema): Command {
  types(schema)
  return (state, dispatch) => {
    const found = findDetails(state)
    const paragraph = schema.nodes['paragraph']
    if (!found || !paragraph) return false
    const blocks: Node[] = []
    found.node.forEach((child, _offset, index) => {
      if (index > 0) blocks.push(child)
      else if (child.content.size) blocks.push(paragraph.create(null, child.content))
    })
    dispatch?.(
      state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, blocks).scrollIntoView(),
    )
    return true
  }
}

/**
 * Opens or closes the section at `pos`. Closing it with the cursor in its
 * content moves the cursor to the end of the title (it would be hidden).
 */
export function setDetailsOpen(pos: number, open: boolean): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (node?.type.name !== 'details') return false
    if (dispatch) {
      const tr = state.tr.setNodeAttrs(pos, { open })
      const titleEnd = pos + 2 + node.child(0).content.size
      const { from, to } = state.selection
      if (!open && to > titleEnd + 1 && from < pos + node.nodeSize)
        tr.setSelection(TextSelection.create(tr.doc, titleEnd))
      dispatch(tr)
    }
    return true
  }
}

/** Opens or closes the section around the cursor. */
export const toggleDetailsOpen: Command = (state, dispatch, view) => {
  const found = findDetails(state)
  if (!found) return false
  return setDetailsOpen(found.pos, !found.node.attrs['open'])(state, dispatch, view)
}

/**
 * Enter in a title: the cursor goes to the start of the content (opening the
 * section), in its first block when empty or in a new paragraph.
 */
export const enterFromSummary: Command = (state, dispatch) => {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== 'details_summary' || !$from.sameParent($to)) return false
  if (dispatch) {
    const tr = state.tr.deleteSelection()
    const $pos = tr.doc.resolve(tr.mapping.map($from.pos))
    const detailsPos = $pos.before($pos.depth - 1)
    const node = tr.doc.nodeAt(detailsPos)!
    if (!node.attrs['open']) tr.setNodeAttrs(detailsPos, { open: true })
    const bodyStart = $pos.after()
    const first = tr.doc.nodeAt(bodyStart)
    const paragraph = state.schema.nodes['paragraph']
    if (!(first?.isTextblock && !first.content.size) && paragraph)
      tr.insert(bodyStart, paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, bodyStart + 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/**
 * Backspace in an empty title of an empty section (nothing but one empty
 * paragraph): the section goes away, leaving an empty paragraph.
 */
export const removeEmptyDetails: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type.name !== 'details_summary' || $from.parent.content.size)
    return false
  const node = $from.node($from.depth - 1)
  const body = node.childCount === 2 ? node.child(1) : null
  if (!body?.isTextblock || body.content.size) return false
  if (dispatch) {
    const pos = $from.before($from.depth - 1)
    const tr = state.tr.replaceWith(pos, pos + node.nodeSize, body)
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}
