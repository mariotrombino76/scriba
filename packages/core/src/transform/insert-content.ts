import { Fragment } from '../model/fragment.js'
import type { Node } from '../model/node.js'
import { Slice } from '../model/slice.js'
import { canReplace } from './structure.js'
import { TransformError, type Transform } from './transform.js'

/*
 * Inserting pasted content where its shape does not match the target.
 *
 * Simple picture: to put three paragraphs in the middle of a list item, cut the
 * item's paragraph at the cursor, slide the paragraphs into the nearest
 * container that accepts them, then sew the first and last pasted paragraph
 * to the text that was before and after the cursor.
 */

/** Runs one transform helper; a schema refusal (no step added) returns false. */
function tryStep(tr: Transform, f: () => void): boolean {
  try {
    f()
    return true
  } catch (e) {
    if (e instanceof TransformError) return false
    throw e
  }
}

/** Keeps only the marks the parent textblock allows; drops inline nodes it cannot hold. */
function fitInline(parent: Node, content: Fragment): Fragment {
  const out: Node[] = []
  content.forEach((child) => {
    if (!parent.type.canContain(child.type)) {
      const text = child.isText ? child.text : ''
      if (text && parent.type.canContain(parent.type.schema.nodes['text']!))
        out.push(parent.type.schema.text(text))
      return
    }
    out.push(child.mark(child.marks.filter((m) => parent.type.allowsMarkType(m.type))))
  })
  return Fragment.fromArray(out)
}

/**
 * Replaces [from, to) with `content` (whole blocks or inline nodes, e.g. a
 * parsed paste), adapting it to the target. Returns the position after the
 * inserted content, or null when nothing sensible could be inserted (no
 * changes are made in that case).
 */
export function insertContent(
  tr: Transform,
  from: number,
  to: number,
  content: Fragment,
): number | null {
  if (from !== to) {
    const before = tr.steps.length
    if (!tryStep(tr, () => tr.delete(from, to))) return null
    from = tr.mapping.slice(before).map(from)
  }
  if (!content.size) return from
  const $pos = tr.doc.resolve(from)
  const first = content.firstChild!

  // Code blocks take plain text only (blocks separated by a newline).
  if ($pos.parent.type.spec.code) {
    const text = content.textBetween(0, content.size, '\n', '\n')
    if (!text) return from
    if (tryStep(tr, () => tr.insert(from, tr.doc.type.schema.text(text)))) return from + text.length
    return null
  }

  // Inline content (or a single textblock): flows into the current textblock.
  // (A lone textblock pasted into an empty one keeps its own type, e.g. a heading.)
  const single = content.childCount === 1 && first.isTextblock && !!$pos.parent.content.size
  if (first.isInline || single) {
    const inline = single ? first.content : content
    if ($pos.parent.inlineContent) {
      const fitted = fitInline($pos.parent, inline)
      if (!fitted.size) return from
      if (tryStep(tr, () => tr.replace(from, from, new Slice(fitted, 0, 0))))
        return from + fitted.size
      return null
    }
  }

  // Blocks: first the natural way (open slice), e.g. paragraphs into paragraphs.
  const open = Slice.maxOpen(content)
  const steps = tr.steps.length
  // (Isolating blocks such as tables are never opened: their cells would merge into the text.)
  if (
    $pos.parent.inlineContent &&
    $pos.parent.content.size &&
    !content.content.some((n) => n.type.spec.isolating) &&
    tryStep(tr, () => tr.replace(from, from, open))
  ) {
    return tr.mapping.slice(steps).map(from, 1) // the end of what was inserted
  }
  return insertBlocks(tr, from, content)
}

function insertBlocks(tr: Transform, pos: number, content: Fragment): number | null {
  const $pos = tr.doc.resolve(pos)
  const inText = $pos.parent.inlineContent
  // Find the nearest ancestor that can take the blocks at the cursor's place.
  let depth = inText ? $pos.depth - 1 : $pos.depth
  for (; depth >= 0; depth--) {
    const node = $pos.node(depth)
    const index = depth === $pos.depth ? $pos.index(depth) : $pos.indexAfter(depth)
    if (canReplace(node, index, index, content)) break
    if (node.type.spec.isolating || depth === 0) return null
  }
  if (depth < 0) return null

  const splitDepth = $pos.depth - depth
  // Pasting into an empty textblock replaces it.
  if (inText && splitDepth === 1 && !$pos.parent.content.size) {
    const index = $pos.index(depth)
    if (canReplace($pos.node(depth), index, index + 1, content)) {
      const start = $pos.before()
      if (tryStep(tr, () => tr.replaceWith(start, $pos.after(), content)))
        return start + content.size
    }
  }
  const atStart = inText && $pos.parentOffset === 0
  const atEnd = inText && $pos.parentOffset === $pos.parent.content.size
  let insertAt: number
  if (splitDepth === 0) {
    insertAt = pos
  } else if (atStart && splitDepth === 1) {
    insertAt = $pos.before()
  } else if (atEnd && splitDepth === 1) {
    insertAt = $pos.after()
  } else if (!tryStep(tr, () => tr.split(pos, splitDepth))) {
    return null
  } else {
    insertAt = pos + splitDepth
  }
  if (!tryStep(tr, () => tr.insert(insertAt, content))) return null
  let end = insertAt + content.size

  // Sew the edges back: first pasted textblock onto the text before, last one onto the text after.
  if (splitDepth === 1 && !atStart && !atEnd) {
    const last = content.lastChild!
    if (last.isTextblock && tryStep(tr, () => tr.join(end))) end -= 2
    if (content.firstChild!.isTextblock && tryStep(tr, () => tr.join(insertAt))) end -= 2
  }
  return end
}
