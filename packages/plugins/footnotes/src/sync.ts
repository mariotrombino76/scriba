import {
  Fragment,
  Plugin,
  ReplaceAroundStep,
  ReplaceStep,
  type Node,
  type NodeType,
  type Schema,
  type Transaction,
} from '@scriba/core'
import { MAX_FOOTNOTES } from './nodes.js'

let counter = 0
/** A new key for a reference and its note (unique in practice; only linking, not security). */
export function newFootnoteKey(): string {
  counter = (counter + 1) % 1_000_000
  return `k${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

interface Ref {
  readonly pos: number
  readonly node: Node
}

/**
 * Adds to `tr` the steps that put footnotes in order: references numbered 1,
 * 2, 3… in reading order; one list at the end of the document with one note
 * per reference, in the same order (a reference without a note gets an empty
 * one; notes without a reference go away); references inside notes and a
 * list without references are removed. When two references share a key (one
 * was copied), the one at a position in `existing` (references that were
 * there before the change) keeps the note. Returns whether anything changed.
 */
export function syncFootnotes(
  tr: Transaction,
  schema: Schema,
  existing: ReadonlySet<number> = new Set(),
): boolean {
  const refType = schema.nodes['footnote_ref']
  const listType = schema.nodes['footnotes']
  const noteType = schema.nodes['footnote']
  const paragraph = schema.nodes['paragraph']
  if (!refType || !listType || !noteType || !paragraph) return false
  const doc = tr.doc

  const refs: Ref[] = []
  const nested: Ref[] = []
  const lists: { pos: number; node: Node }[] = []
  const notes = new Map<string, Node>()
  doc.forEach((block, offset) => {
    if (block.type === listType) {
      lists.push({ pos: offset, node: block })
      block.forEach((note) => {
        const key = note.attrs['key'] as string
        if (key && !notes.has(key)) notes.set(key, note)
      })
      block.descendants((node, pos) => {
        if (node.type === refType) nested.push({ pos: offset + 1 + pos, node })
      })
      return
    }
    block.descendants((node, pos) => {
      if (node.type === refType) refs.push({ pos: offset + 1 + pos, node })
    })
  })
  const kept = refs.slice(0, MAX_FOOTNOTES)

  // the references as they should be: numbers in order, unique keys
  // a key used twice: the reference that was already there keeps it (the copy gets a new one)
  const owner = new Map<string, number>()
  for (const ref of kept) {
    const key = ref.node.attrs['key'] as string
    if (key && (!owner.has(key) || (existing.has(ref.pos) && !existing.has(owner.get(key)!))))
      owner.set(key, ref.pos)
  }
  const wanted = kept.map((ref, i) => {
    const own = ref.node.attrs['key'] as string
    const key = own && owner.get(own) === ref.pos ? own : newFootnoteKey()
    return { ref, n: i + 1, key }
  })
  const list = wanted.length
    ? listType.create(
        null,
        wanted.map(({ n, key }) => {
          const note = notes.get(key)
          return note
            ? note.type.create({ ...note.attrs, n, key }, withoutRefs(note.content, refType))
            : noteType.create({ n, key }, paragraph.create())
        }),
      )
    : null

  const refsOk = wanted.every(
    ({ ref, n, key }) => ref.node.attrs['n'] === n && ref.node.attrs['key'] === key,
  )
  const listOk =
    nested.length === 0 &&
    refs.length === kept.length &&
    (list === null
      ? lists.length === 0
      : lists.length === 1 &&
        lists[0]!.pos + lists[0]!.node.nodeSize === doc.content.size &&
        lists[0]!.node.eq(list))
  if (refsOk && listOk) return false

  // 1. references (attribute changes keep positions)
  for (const { ref, n, key } of wanted)
    if (ref.node.attrs['n'] !== n || ref.node.attrs['key'] !== key)
      tr.setNodeAttrs(ref.pos, { n, key })
  // 2. references beyond the limit, then the lists (from the end: earlier positions stay)
  const removals = [
    ...refs.slice(kept.length).map((r) => ({ from: r.pos, to: r.pos + r.node.nodeSize })),
    ...lists.map((l) => ({ from: l.pos, to: l.pos + l.node.nodeSize })),
  ].sort((a, b) => b.from - a.from)
  if (list) tr.insert(tr.doc.content.size, list)
  for (const { from, to } of removals) tr.delete(from, to)
  // 3. a document left empty keeps a paragraph
  if (tr.doc.childCount === 0) tr.insert(0, paragraph.create())
  return true
}

/** `content` without footnote references (a note cannot hold one). */
function withoutRefs(content: Fragment, refType: NodeType): Fragment {
  const children: Node[] = []
  content.forEach((child) => {
    if (child.type === refType) return
    children.push(child.isLeaf ? child : child.copy(withoutRefs(child.content, refType)))
  })
  return Fragment.fromArray(children)
}

/** Whether `fragment` contains a node of one of `types`. */
function contains(fragment: Fragment, types: readonly NodeType[]): boolean {
  let found = false
  fragment.nodesBetween(0, fragment.size, (node) => {
    if (found) return false
    if (types.includes(node.type)) found = true
    return !found
  })
  return found
}

/**
 * Whether the transactions may have changed footnotes: they removed or
 * inserted a reference, a note or a list. Typing elsewhere does not (and so
 * costs nothing in a big document).
 */
function touchesFootnotes(trs: readonly Transaction[], types: readonly NodeType[]): boolean {
  for (const tr of trs) {
    for (let i = 0; i < tr.steps.length; i++) {
      const step = tr.steps[i]!
      const before = tr.docs[i]!
      if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
        if (contains(step.slice.content, types)) return true
        if (step.from < step.to && contains(before.slice(step.from, step.to).content, types))
          return true
      }
    }
  }
  return false
}

/** Keeps footnotes in order after every change (typing, paste, undo, collaboration). */
export function footnotes(): Plugin {
  return new Plugin({
    appendTransaction(trs, old, state) {
      const types = ['footnote_ref', 'footnotes', 'footnote']
        .map((name) => state.schema.nodes[name])
        .filter((t): t is NodeType => !!t)
      if (!trs.some((tr) => tr.docChanged) || !touchesFootnotes(trs, types)) return null
      // where the references of before the change are now
      const existing = new Set<number>()
      old.doc.descendants((node, pos) => {
        if (node.type.name !== 'footnote_ref') return
        let mapped: number | null = pos
        for (const tr of trs) {
          const r = tr.mapping.mapResult(mapped!, 1)
          mapped = r.deleted ? null : r.pos
          if (mapped === null) break
        }
        if (mapped !== null) existing.add(mapped)
      })
      const tr = state.tr
      return syncFootnotes(tr, state.schema, existing) ? tr : null
    },
  })
}
