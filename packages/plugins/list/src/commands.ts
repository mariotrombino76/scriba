import {
  Fragment,
  NodeRange,
  ReplaceAroundStep,
  SetNodeTypeStep,
  Slice,
  TextSelection,
  blockRange,
  findWrapping,
  liftTarget,
  type Command,
  type EditorState,
  type NodeType,
  type ResolvedPos,
  type Transaction,
} from '@scriba/core'

/** Range over sibling list items containing the selection. */
function itemRange(state: EditorState, itemType: NodeType): NodeRange | null {
  const { $from, $to } = state.selection
  return blockRange($from, $to, (node) => node.childCount > 0 && node.firstChild!.type === itemType)
}

/** Depth of the innermost list containing `$pos`, or -1. */
function listDepth($pos: ResolvedPos, itemType: NodeType): number {
  for (let d = $pos.depth - 1; d > 0; d--) {
    if ($pos.node(d + 1).type === itemType && $pos.node(d).firstChild?.type === itemType) return d
  }
  return -1
}

/** Wraps the selected blocks in a list, one item per block. */
export function wrapInList(
  listType: NodeType,
  itemType: NodeType,
  attrs?: Record<string, unknown> | null,
): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    const range = blockRange($from, $to)
    if (!range) return false
    const wrappers = findWrapping(range, listType, attrs)
    if (!wrappers || wrappers[1]?.type !== itemType) return false
    if (!dispatch) return true
    const tr = state.tr.wrap(range, wrappers)
    // Split the single item so that every top-level block gets its own item.
    const boundaries: number[] = []
    let pos = range.start + 2
    for (let i = range.startIndex; i < range.endIndex - 1; i++) {
      pos += range.parent.child(i).nodeSize
      boundaries.push(pos)
    }
    for (let i = boundaries.length - 1; i >= 0; i--) {
      try {
        tr.split(boundaries[i]!, 1)
      } catch {
        // the next block cannot start an item (e.g. a heading): keep it in the current one
      }
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

/**
 * Toolbar/shortcut behaviour: outside a list → wrap in `listType`;
 * inside a list of the same type → take the items out; inside another list type → switch type.
 */
export function toggleList(
  listType: NodeType,
  itemType: NodeType,
  attrs?: Record<string, unknown> | null,
): Command {
  return (state, dispatch) => {
    const depth = listDepth(state.selection.$from, itemType)
    if (depth < 0) return wrapInList(listType, itemType, attrs)(state, dispatch)
    const list = state.selection.$from.node(depth)
    if (list.type === listType) return liftListItem(itemType)(state, dispatch)
    if (dispatch) {
      const pos = state.selection.$from.before(depth)
      dispatch(state.tr.step(new SetNodeTypeStep(pos, listType, attrs ?? null)).scrollIntoView())
    }
    return true
  }
}

/** Enter inside a list item: new item; in an empty item: leave the list. */
export function splitListItem(itemType: NodeType): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection
    if ($from.depth < 2 || !$from.sameParent($to) || $from.node(-1).type !== itemType) return false
    if (!$from.parent.isTextblock) return false
    const item = $from.node(-1)
    if (!$from.parent.content.size && $from.index(-1) === 0 && item.childCount === 1) {
      return liftListItem(itemType)(state, dispatch)
    }
    if (dispatch) {
      const tr = state.tr
      if (!state.selection.empty) tr.deleteSelection()
      const $pos = tr.selection.$from
      const atEnd = $pos.parentOffset === $pos.parent.content.size
      const paragraph = $pos.parent.type.schema.nodes['paragraph']
      tr.split($pos.pos, 2, atEnd && paragraph ? [{ type: paragraph }, null] : undefined)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Tab: moves the selected items into a sub-list of the item before them. */
export function sinkListItem(itemType: NodeType): Command {
  return (state, dispatch) => {
    const range = itemRange(state, itemType)
    if (!range || range.startIndex === 0) return false
    const parent = range.parent
    const before = parent.child(range.startIndex - 1)
    if (before.type !== itemType) return false
    if (dispatch) {
      // If the item before already ends with a sub-list of the same type, join it.
      const nestedBefore = before.lastChild?.type === parent.type
      const inner = Fragment.from(nestedBefore ? itemType.create() : null)
      const wrapper = itemType.create(null, Fragment.from(parent.type.create(null, inner)))
      const open = nestedBefore ? 3 : 1
      const slice = new Slice(Fragment.from(wrapper), open, 0)
      const { start, end } = range
      dispatch(
        state.tr
          .step(new ReplaceAroundStep(start - open, end, start, end, slice, 1))
          .scrollIntoView(),
      )
    }
    return true
  }
}

/** Shift+Tab: moves the selected items one level up, or out of the list at the top level. */
export function liftListItem(itemType: NodeType): Command {
  return (state, dispatch) => {
    const range = itemRange(state, itemType)
    if (!range) return false
    const tr = state.tr
    const ok =
      range.depth > 0 && range.$from.node(range.depth - 1).type === itemType
        ? liftToOuterList(tr, range, itemType)
        : liftOutOfList(tr, range)
    if (!ok) return false
    dispatch?.(tr.scrollIntoView())
    return true
  }
}

function liftToOuterList(tr: Transaction, range: NodeRange, itemType: NodeType): boolean {
  let r = range
  const end = range.end
  const endOfList = range.$to.end(range.depth)
  if (end < endOfList) {
    // Items after the lifted ones become a sub-list of the last lifted item (visual order is kept).
    const slice = new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0)
    tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList, slice, 1))
    r = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth)
  }
  const target = liftTarget(r)
  if (target === null) return false
  tr.lift(r, target)
  return true
}

function liftOutOfList(tr: Transaction, range: NodeRange): boolean {
  const positions: number[] = []
  let pos = range.start
  for (let i = range.startIndex; i < range.endIndex; i++) {
    positions.push(pos)
    pos += range.parent.child(i).nodeSize
  }
  // Last item first: earlier positions are not affected.
  for (let i = positions.length - 1; i >= 0; i--) {
    const at = tr.mapping.map(positions[i]!, 1)
    const item = tr.doc.nodeAt(at)
    if (!item) return false
    const inner = blockRange(tr.doc.resolve(at + 2), tr.doc.resolve(at + item.nodeSize - 2))
    const target = inner && liftTarget(inner)
    if (!inner || target === null || target === undefined) return false
    tr.lift(inner, target)
  }
  return true
}

/** Backspace at the start of a list item's first paragraph: outdent instead of joining. */
export function liftListItemAtStart(itemType: NodeType): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof TextSelection) || !sel.$cursor) return false
    const $c = sel.$cursor
    if ($c.parentOffset > 0 || $c.depth < 2 || $c.node(-1).type !== itemType || $c.index(-1) > 0)
      return false
    return liftListItem(itemType)(state, dispatch)
  }
}

/** True when the selection is in a list of `listType` (innermost list). */
export function isInList(state: EditorState, listType: NodeType, itemType: NodeType): boolean {
  const depth = listDepth(state.selection.$from, itemType)
  return depth >= 0 && state.selection.$from.node(depth).type === listType
}

/**
 * Sets an attribute of the list around the cursor (e.g. its bullet shape or
 * numbering) when it is a `listType` list; otherwise wraps the selection in a
 * new one with that attribute.
 */
export function setListStyle(
  listType: NodeType,
  itemType: NodeType,
  attrs: Record<string, unknown>,
): Command {
  return (state, dispatch) => {
    const depth = listDepth(state.selection.$from, itemType)
    if (depth >= 0 && state.selection.$from.node(depth).type === listType) {
      if (dispatch) {
        const pos = state.selection.$from.before(depth)
        dispatch(state.tr.setNodeAttrs(pos, attrs).scrollIntoView())
      }
      return true
    }
    return toggleList(listType, itemType, attrs)(state, dispatch)
  }
}

/** The attribute of the list around the cursor, when it is a `listType` list. */
export function listAttr(
  state: EditorState,
  listType: NodeType,
  itemType: NodeType,
  attr: string,
): unknown {
  const depth = listDepth(state.selection.$from, itemType)
  const list = depth >= 0 ? state.selection.$from.node(depth) : null
  return list?.type === listType ? list.attrs[attr] : undefined
}
