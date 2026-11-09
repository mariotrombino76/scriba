import { Fragment, Mark, type Node } from '@scriba/core'

/**
 * Document comparison, pure (no DOM). The result is one merged document
 * holding the content of both versions: what only the old one has is marked
 * "delete", what only the new one has is marked "insert". Blocks are matched
 * first; matched paragraphs are then compared word by word.
 */

export type ChangeKind = 'insert' | 'delete'

/** A range of the merged document to highlight (always inside a textblock). */
export interface Highlight {
  readonly kind: ChangeKind
  readonly from: number
  readonly to: number
}

/** One change to step through: some words, or a whole block. */
export interface Change {
  readonly kind: ChangeKind
  readonly from: number
  readonly to: number
  /** Its text (empty for an image or another element without text). */
  readonly text: string
}

export interface DocDiff {
  readonly doc: Node
  readonly highlights: readonly Highlight[]
  readonly changes: readonly Change[]
}

/** Above this many comparisons a range is shown as replaced, not compared in detail. */
export const MAX_COMPARISONS = 4_000_000

type Op =
  readonly ['equal', number, number] | readonly ['delete', number] | readonly ['insert', number]

/**
 * Edit script between two sequences (longest common subsequence). The common
 * start and end are skipped first, so the usual small edit is cheap; a middle
 * part too big to compare becomes "delete all, insert all".
 */
export function diffSequence<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): Op[] {
  let start = 0
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--
    endB--
  }
  const ops: Op[] = []
  for (let i = 0; i < start; i++) ops.push(['equal', i, i])
  const n = endA - start
  const m = endB - start
  if (n && m && n * m <= MAX_COMPARISONS) {
    // lengths of the common subsequences of the suffixes
    const w = m + 1
    const table = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i * w + j] = eq(a[start + i]!, b[start + j]!)
          ? table[(i + 1) * w + j + 1]! + 1
          : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!)
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (eq(a[start + i]!, b[start + j]!)) ops.push(['equal', start + i++, start + j++])
      else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) ops.push(['delete', start + i++])
      else ops.push(['insert', start + j++])
    }
    while (i < n) ops.push(['delete', start + i++])
    while (j < m) ops.push(['insert', start + j++])
  } else {
    for (let i = start; i < endA; i++) ops.push(['delete', i])
    for (let j = start; j < endB; j++) ops.push(['insert', j])
  }
  for (let i = endA, j = endB; i < a.length; i++, j++) ops.push(['equal', i, j])
  return ops
}

/**
 * Moves each run of only insertions (or only deletions) to the right while
 * the result is the same: "dorme[. Sogna]." becomes "dorme[ Sogna.]", which
 * is how a person reads the change. Equal tokens on both sides are swapped,
 * never changed.
 */
export function slideEdits<T>(
  ops: Op[],
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): Op[] {
  const out = [...ops]
  for (let k = 0; k < out.length; k++) {
    const kind = out[k]![0]
    if (kind === 'equal') continue
    let end = k
    while (end + 1 < out.length && out[end + 1]![0] === kind) end++
    const mixed =
      (end + 1 < out.length && out[end + 1]![0] !== 'equal') ||
      (k > 0 && out[k - 1]![0] !== 'equal')
    if (mixed) {
      k = end
      continue
    }
    const seq = kind === 'insert' ? b : a
    // the run is seq[first..last]; the equal op after it pairs seq[last + 1]
    while (end + 1 < out.length) {
      const after = out[end + 1] as readonly ['equal', number, number]
      const first = out[k]![1] as number
      const next = kind === 'insert' ? after[2] : after[1]
      if (!eq(seq[first]!, seq[next]!)) break
      // seq[first] takes the place of seq[next] in the equal pair; the run moves one step right
      const equal: Op = kind === 'insert' ? ['equal', after[1], first] : ['equal', first, after[2]]
      out.splice(k, 1)
      out.splice(end, 1, kind === 'insert' ? ['insert', next] : ['delete', next])
      out.splice(k, 0, equal)
      k++
      end++
      if (end + 1 < out.length && out[end + 1]![0] !== 'equal') break
    }
    k = end
  }
  return out
}

/** A word, a space run, a punctuation sign, or an inline element (image, mention…). */
interface Token {
  readonly text: string
  readonly marks: readonly Mark[]
  readonly node: Node | null
}

const WORDS = /\s+|[\p{L}\p{N}\p{M}_]+|[^\s\p{L}\p{N}\p{M}_]/gu

function tokens(block: Node): Token[] {
  const out: Token[] = []
  block.forEach((child) => {
    if (!child.isText) out.push({ text: '', marks: child.marks, node: child })
    else
      for (const [text] of child.text.matchAll(WORDS))
        out.push({ text, marks: child.marks, node: null })
  })
  return out
}

const sameToken = (x: Token, y: Token) =>
  x.node || y.node
    ? !!x.node && !!y.node && x.node.eq(y.node)
    : x.text === y.text && Mark.sameSet(x.marks, y.marks)

const tokenNode = (block: Node, token: Token): Node =>
  token.node ?? block.type.schema.text(token.text, token.marks)

/** What a merge adds at some position: nodes, ranges to highlight, changes. */
interface Merged {
  nodes: Node[]
  highlights: Highlight[]
  changes: Change[]
}

/**
 * Word by word comparison of two textblocks, merged into the new one's type.
 * `base` is the position where the block's content will start.
 */
function mergeInline(
  a: Node,
  b: Node,
  base: number,
): { block: Node; highlights: Highlight[]; changes: Change[] } {
  const ta = tokens(a)
  const tb = tokens(b)
  const nodes: Node[] = []
  const highlights: Highlight[] = []
  const changes: Change[] = []
  let pos = base
  for (const op of slideEdits(diffSequence(ta, tb, sameToken), ta, tb, sameToken)) {
    const kind = op[0] === 'equal' ? null : op[0]
    const token = op[0] === 'insert' ? tb[op[1]]! : ta[op[1]]!
    const node = tokenNode(op[0] === 'insert' ? b : a, token)
    nodes.push(node)
    const to = pos + node.nodeSize
    if (kind) {
      const last = highlights[highlights.length - 1]
      // one change per run of the same kind: spaces between changed words do not split it
      if (last && last.kind === kind && last.to === pos) {
        highlights[highlights.length - 1] = { ...last, to }
        const c = changes[changes.length - 1]!
        changes[changes.length - 1] = { ...c, to, text: c.text + token.text }
      } else {
        highlights.push({ kind, from: pos, to })
        changes.push({ kind, from: pos, to, text: token.text })
      }
    }
    pos = to
  }
  return { block: b.copy(Fragment.fromArray(nodes)), highlights, changes }
}

/** A whole block only in one version: every text inside it is highlighted, one change. */
function wholeBlock(node: Node, kind: ChangeKind, pos: number): Merged {
  const highlights: Highlight[] = []
  if (node.isTextblock) {
    if (node.content.size) highlights.push({ kind, from: pos + 1, to: pos + 1 + node.content.size })
  } else
    node.descendants((child, at) => {
      if (!child.isTextblock) return true
      if (child.content.size) {
        const from = pos + 1 + at + 1
        highlights.push({ kind, from, to: from + child.content.size })
      }
      return false
    })
  return {
    nodes: [node],
    highlights,
    changes: [{ kind, from: pos, to: pos + node.nodeSize, text: node.textContent }],
  }
}

/** Rows are compared whole: merging the cells of two rows would not make a table. */
const comparesChildren = (a: Node, b: Node) =>
  !a.isTextblock && !a.isLeaf && a.type.spec.tableRole !== 'row' && a.sameMarkup(b)

/** Two blocks in the same place that differ: compared inside, or replaced. */
function mergeChanged(a: Node, b: Node, pos: number): Merged | null {
  if (a.isTextblock && b.isTextblock) {
    // another type or other attributes (heading level, alignment…): shown as replaced
    if (!a.sameMarkup(b)) return null
    const inline = mergeInline(a, b, pos + 1)
    return { nodes: [inline.block], highlights: inline.highlights, changes: inline.changes }
  }
  if (comparesChildren(a, b)) {
    const inner = mergeChildren(a, b, pos + 1)
    return {
      nodes: [b.copy(Fragment.fromArray(inner.nodes))],
      highlights: inner.highlights,
      changes: inner.changes,
    }
  }
  return null
}

function mergeChildren(a: Node, b: Node, base: number): Merged {
  const ca: Node[] = []
  const cb: Node[] = []
  a.forEach((n) => ca.push(n))
  b.forEach((n) => cb.push(n))
  const ops = diffSequence(ca, cb, (x, y) => x.eq(y))
  const out: Merged = { nodes: [], highlights: [], changes: [] }
  let pos = base
  const add = (m: Merged) => {
    out.nodes.push(...m.nodes)
    out.highlights.push(...m.highlights)
    out.changes.push(...m.changes)
    for (const node of m.nodes) pos += node.nodeSize
  }
  for (let k = 0; k < ops.length;) {
    const op = ops[k]!
    if (op[0] === 'equal') {
      add({ nodes: [cb[op[2]]!], highlights: [], changes: [] })
      k++
      continue
    }
    // a run of deletions and insertions: pair them in order, the rest is removed or added
    const deleted: Node[] = []
    const inserted: Node[] = []
    for (; k < ops.length && ops[k]![0] !== 'equal'; k++) {
      const o = ops[k]!
      if (o[0] === 'delete') deleted.push(ca[o[1]]!)
      else inserted.push(cb[o[1]]!)
    }
    const pairs = Math.min(deleted.length, inserted.length)
    for (let i = 0; i < pairs; i++) {
      const merged = mergeChanged(deleted[i]!, inserted[i]!, pos)
      if (merged) add(merged)
      else {
        add(wholeBlock(deleted[i]!, 'delete', pos))
        add(wholeBlock(inserted[i]!, 'insert', pos))
      }
    }
    for (const node of deleted.slice(pairs)) add(wholeBlock(node, 'delete', pos))
    for (const node of inserted.slice(pairs)) add(wholeBlock(node, 'insert', pos))
  }
  return out
}

/**
 * Compares two versions of a document. The merged document is for showing
 * only: it may not follow every rule of the schema (two versions of a block
 * side by side), so it is never put back into an editor that can change it.
 */
export function diffDocs(oldDoc: Node, newDoc: Node): DocDiff {
  const merged = mergeChildren(oldDoc, newDoc, 0)
  return {
    doc: newDoc.copy(Fragment.fromArray(merged.nodes)),
    highlights: merged.highlights,
    changes: merged.changes,
  }
}
