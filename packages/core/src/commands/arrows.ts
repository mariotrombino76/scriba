import { NodeSelection, Selection, TextSelection } from '../state/selection.js'
import type { Command, CommandView } from './base.js'

export type ArrowDirection = 'left' | 'right' | 'up' | 'down'

interface Coords {
  top: number
  bottom: number
}
type ViewWithCoords = CommandView & { coordsAtPos(pos: number): Coords }

function hasCoords(view: CommandView | undefined): view is ViewWithCoords {
  return !!view && typeof (view as Partial<ViewWithCoords>).coordsAtPos === 'function'
}

/** The caret is on the first (dir < 0) or last (dir > 0) line of its textblock. */
function onEdgeLine(view: ViewWithCoords, pos: number, edge: number, dir: number): boolean {
  try {
    const caret = view.coordsAtPos(pos)
    const end = view.coordsAtPos(edge)
    return dir > 0 ? caret.bottom >= end.bottom - 2 : caret.top <= end.top + 2
  } catch {
    return pos === edge
  }
}

/**
 * Arrow keys around atomic nodes (an image, a task, a custom node view),
 * which the browser cannot put a caret into:
 * - from a selected node, move to the text before or after it;
 * - from the edge of a textblock, select the atomic block next to it
 *   (up/down: from its first/last line) instead of jumping over it.
 * Returns false otherwise, so the browser moves the caret as usual.
 */
export function arrowAtom(dir: ArrowDirection): Command {
  const forward = dir === 'right' || dir === 'down'
  return (state, dispatch, view) => {
    const sel = state.selection
    const { doc } = state
    if (sel instanceof NodeSelection) {
      const $pos = doc.resolve(forward ? sel.to : sel.from)
      const next = sel.node.isInline
        ? TextSelection.create(doc, $pos.pos)
        : Selection.near($pos, forward ? 1 : -1)
      if (next instanceof NodeSelection && next.from === sel.from) return false
      dispatch?.(state.tr.setSelection(next).scrollIntoView())
      return true
    }
    if (!(sel instanceof TextSelection) || !sel.empty) return false
    const $cursor = sel.$head
    if (!$cursor.parent.isTextblock || $cursor.depth < 1) return false
    const edge = forward ? $cursor.end() : $cursor.start()
    const vertical = dir === 'up' || dir === 'down'
    const atEdge =
      $cursor.pos === edge ||
      (vertical && hasCoords(view) && onEdgeLine(view, $cursor.pos, edge, forward ? 1 : -1))
    if (!atEdge) return false
    const beside = forward ? $cursor.after() : $cursor.before()
    const node = forward ? doc.resolve(beside).nodeAfter : doc.resolve(beside).nodeBefore
    if (!node || !node.isBlock || !node.isAtom || !NodeSelection.isSelectable(node)) return false
    const at = forward ? beside : beside - node.nodeSize
    dispatch?.(state.tr.setSelection(NodeSelection.create(doc, at)).scrollIntoView())
    return true
  }
}
