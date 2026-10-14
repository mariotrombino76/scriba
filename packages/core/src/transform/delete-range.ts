import { Fragment } from '../model/fragment.js'
import { ReplaceError } from '../model/replace.js'
import type { ResolvedPos } from '../model/resolvedpos.js'
import { Slice } from '../model/slice.js'

/** A replacement that deletes a range: replace [from, to) with `slice`. */
export interface DeletePlan {
  readonly to: number
  readonly slice: Slice
}

function fits($from: ResolvedPos, to: number, slice: Slice): boolean {
  try {
    $from.doc.replace($from.pos, to, slice)
    return true
  } catch (e) {
    if (e instanceof ReplaceError) return false
    throw e
  }
}

/**
 * Finds how to delete [$from, $to) when the two ends may sit at different depths.
 *
 * Simple picture: we cut the text after `$to` ("the tail") and glue it onto the
 * block containing `$from`, then throw away everything in between. Containers on
 * the `$to` side keep whatever follows the deleted part; containers left empty
 * disappear.
 *
 * Returns null when no schema-valid deletion exists.
 */
export function deleteRangeSlice($from: ResolvedPos, $to: ResolvedPos): DeletePlan | null {
  if ($from.depth === $to.depth && fits($from, $to.pos, Slice.empty)) {
    return { to: $to.pos, slice: Slice.empty }
  }
  if (!$from.parent.inlineContent || !$to.parent.inlineContent) return null

  const base = $from.sharedDepth($to.pos)
  if (base >= $from.depth || base >= $to.depth) return null
  const tail = $to.parent.content.cut($to.parentOffset)

  // Climb out of $to-side containers that would be left empty.
  let k = $to.depth
  while (k - 1 > base && $to.index(k - 1) === $to.node(k - 1).childCount - 1) k--
  const to = $to.after(k)

  let left = tail
  for (let d = $from.depth; d > base; d--) left = Fragment.from($from.node(d).copy(left))
  let right = Fragment.empty
  for (let d = k - 1; d > base; d--) right = Fragment.from($to.node(d).copy(right))

  const slice = new Slice(left.append(right), $from.depth - base, k - 1 - base)
  return fits($from, to, slice) ? { to, slice } : null
}
