import * as Y from 'yjs'
import { Fragment, type Mark, type Node, type Schema } from '@scriba-editor/core'

/**
 * Document ↔ Yjs mapping (simple picture: the same LEGO construction written
 * in two notebooks; Yjs is the notebook everybody can write in at once).
 *
 * - every non-text node is a `Y.XmlElement` named after its type, with its
 *   attributes as JSON strings;
 * - the inline content of a textblock is one `Y.XmlText`: text with marks as
 *   formatting attributes, inline leaves (images, line breaks) as embeds.
 *
 * Remote content is untrusted (§5.8): `fromY` rebuilds nodes only through the
 * schema; unknown types, invalid attributes and invalid structures are dropped.
 */

/** Longest attribute value accepted from Yjs (a JSON string). */
const MAX_ATTR_LENGTH = 100_000

interface Embed {
  type: string
  attrs?: Record<string, unknown>
}

function marksToAttrs(marks: readonly Mark[]): Record<string, unknown> | undefined {
  if (!marks.length) return undefined
  const out: Record<string, unknown> = {}
  for (const m of marks)
    out[m.type.name] = Object.keys(m.attrs).length ? JSON.stringify(m.attrs) : true
  return out
}

function inlineDelta(
  node: Node,
): { insert: string | Embed; attributes?: Record<string, unknown> }[] {
  const delta: { insert: string | Embed; attributes?: Record<string, unknown> }[] = []
  node.forEach((child) => {
    const attributes = marksToAttrs(child.marks)
    const insert = child.isText ? child.text : { type: child.type.name, attrs: { ...child.attrs } }
    delta.push(attributes ? { insert, attributes } : { insert })
  })
  return delta
}

/** A Scriba node as a new Yjs element (not yet attached). */
export function toY(node: Node): Y.XmlElement {
  const el = new Y.XmlElement(node.type.name)
  for (const [key, value] of Object.entries(node.attrs)) el.setAttribute(key, JSON.stringify(value))
  if (node.isTextblock) {
    const text = new Y.XmlText()
    text.applyDelta(inlineDelta(node))
    el.insert(0, [text])
  } else {
    const children: Y.XmlElement[] = []
    node.forEach((child) => children.push(toY(child)))
    if (children.length) el.insert(0, children)
  }
  return el
}

function readAttrs(el: Y.XmlElement): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(el.getAttributes())) {
    if (typeof raw !== 'string' || raw.length > MAX_ATTR_LENGTH) continue
    try {
      out[key] = JSON.parse(raw)
    } catch {
      /* not ours: ignored */
    }
  }
  return out
}

function readMarks(schema: Schema, attributes: Record<string, unknown> | undefined): Mark[] {
  const marks: Mark[] = []
  for (const [name, raw] of Object.entries(attributes ?? {})) {
    const type = schema.marks[name]
    if (!type || raw === null || raw === undefined) continue
    try {
      const attrs = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : null
      marks.push(type.create(attrs)) // validated by the schema (e.g. link URLs, §5.3)
    } catch {
      /* invalid mark: dropped */
    }
  }
  return marks
}

function inlineFromY(schema: Schema, parentType: Node['type'], text: Y.XmlText): Node[] {
  const out: Node[] = []
  for (const op of text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    const marks = readMarks(schema, op.attributes).filter((m) => parentType.allowsMarkType(m.type))
    if (typeof op.insert === 'string') {
      if (op.insert) out.push(schema.text(op.insert, marks))
    } else if (op.insert && typeof op.insert === 'object') {
      const embed = op.insert as Embed
      const type = typeof embed.type === 'string' ? schema.nodes[embed.type] : undefined
      if (!type || !type.isInline || type.isText) continue
      try {
        out.push(type.create(embed.attrs ?? null, null, marks))
      } catch {
        /* invalid inline node: dropped */
      }
    }
  }
  return out
}

/** A node from Yjs, or null when the schema does not accept it. */
export function nodeFromY(schema: Schema, el: Y.XmlElement): Node | null {
  const type = schema.nodes[el.nodeName]
  if (!type || type.isText || type === schema.topNodeType) return null
  try {
    let content: Node[]
    if (type.isTextblock) {
      const text = el.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText)
      content = text ? inlineFromY(schema, type, text) : []
    } else {
      content = el
        .toArray()
        .filter((c): c is Y.XmlElement => c instanceof Y.XmlElement)
        .map((c) => nodeFromY(schema, c))
        .filter((n): n is Node => !!n)
    }
    const attrs = readAttrs(el)
    const fragment = Fragment.fromArray(content)
    if (type.validContent(fragment)) return type.create(attrs, fragment)
    // invalid structure (e.g. a row without cells): repair if the schema can, else drop
    return type.createAndFill(attrs, fragment)
  } catch {
    return null
  }
}

/** The whole document from Yjs (always a valid document). */
export function docFromY(schema: Schema, fragment: Y.XmlFragment): Node {
  const blocks = fragment
    .toArray()
    .filter((c): c is Y.XmlElement => c instanceof Y.XmlElement)
    .map((c) => nodeFromY(schema, c))
    .filter((n): n is Node => !!n)
  const top = schema.topNodeType
  const content = Fragment.fromArray(blocks)
  return (
    (top.validContent(content) ? top.create(null, content) : top.createAndFill(null, content)) ??
    top.createAndFill()!
  )
}

// --- Local changes → Yjs (minimal operations) ------------------------------

type Child = Y.XmlElement | Y.XmlText

/** Updates `parent`'s children from `oldNode`'s to `newNode`'s, touching only what changed. */
function updateChildren(parent: Y.XmlFragment | Y.XmlElement, oldNode: Node, newNode: Node): void {
  const yChildren = parent.toArray() as Child[]
  const oldC: Node[] = []
  const newC: Node[] = []
  oldNode.forEach((c) => oldC.push(c))
  newNode.forEach((c) => newC.push(c))
  if (yChildren.length !== oldC.length) {
    // out of step (e.g. invalid remote elements we skipped): rewrite this level
    if (yChildren.length) parent.delete(0, yChildren.length)
    if (newC.length) parent.insert(0, newC.map(toY))
    return
  }
  let start = 0
  while (start < oldC.length && start < newC.length && oldC[start] === newC[start]) start++
  let endOld = oldC.length
  let endNew = newC.length
  while (endOld > start && endNew > start && oldC[endOld - 1] === newC[endNew - 1]) {
    endOld--
    endNew--
  }
  // changed nodes of the same type in the same place: update in place (keeps concurrent edits)
  while (start < endOld && start < endNew && oldC[start]!.type === newC[start]!.type) {
    updateElement(yChildren[start] as Y.XmlElement, oldC[start]!, newC[start]!)
    start++
  }
  while (endOld > start && endNew > start && oldC[endOld - 1]!.type === newC[endNew - 1]!.type) {
    updateElement(yChildren[endOld - 1] as Y.XmlElement, oldC[endOld - 1]!, newC[endNew - 1]!)
    endOld--
    endNew--
  }
  if (endOld > start) parent.delete(start, endOld - start)
  if (endNew > start) parent.insert(start, newC.slice(start, endNew).map(toY))
}

function updateElement(el: Y.XmlElement, oldNode: Node, newNode: Node): void {
  if (oldNode === newNode) return
  for (const [key, value] of Object.entries(newNode.attrs)) {
    const json = JSON.stringify(value)
    if (el.getAttribute(key) !== json) el.setAttribute(key, json)
  }
  if (newNode.isTextblock) {
    let text = el.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText)
    if (!text) {
      text = new Y.XmlText()
      el.insert(0, [text])
    }
    updateText(text, oldNode, newNode)
  } else updateChildren(el, oldNode, newNode)
}

/** One entry per character / inline leaf: what it is and its marks. */
function atoms(node: Node): { key: string; attrs: Record<string, unknown> | undefined }[] {
  const out: { key: string; attrs: Record<string, unknown> | undefined }[] = []
  node.forEach((child) => {
    const attrs = marksToAttrs(child.marks)
    if (child.isText) for (const ch of child.text) out.push({ key: ch, attrs })
    else out.push({ key: `\u0000${child.type.name}${JSON.stringify(child.attrs)}`, attrs })
  })
  return out
}

/** Text edits as the smallest delete/insert, then formatting changes as `format` calls. */
function updateText(text: Y.XmlText, oldNode: Node, newNode: Node): void {
  const a = atoms(oldNode)
  const b = atoms(newNode)
  let start = 0
  while (start < a.length && start < b.length && a[start]!.key === b[start]!.key) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1]!.key === b[endB - 1]!.key) {
    endA--
    endB--
  }
  // positions in Y.Text count UTF-16 units; atoms are code points (chars may be 2 units)
  const units = (list: typeof a, from: number, to: number) =>
    list.slice(from, to).reduce((n, x) => n + (x.key.startsWith('\u0000') ? 1 : x.key.length), 0)
  const at = units(a, 0, start)
  const delLen = units(a, start, endA)
  if (delLen) text.delete(at, delLen)
  if (endB > start) {
    let offset = at
    // insert run by run (same marks together)
    let i = start
    while (i < endB) {
      let j = i
      let chunk = ''
      while (
        j < endB &&
        JSON.stringify(b[j]!.attrs) === JSON.stringify(b[i]!.attrs) &&
        !b[j]!.key.startsWith('\u0000')
      ) {
        chunk += b[j]!.key
        j++
      }
      if (chunk) {
        text.insert(offset, chunk, b[i]!.attrs ?? {})
        offset += chunk.length
        i = j
      } else {
        const leaf = embedAt(newNode, i)
        text.insertEmbed(offset, leaf, b[i]!.attrs ?? {})
        offset += 1
        i++
      }
    }
  }
  // formatting changes on the unchanged text (e.g. bold on a word)
  const formatRuns = (from: number, to: number, shift: number) => {
    let pos = units(b, 0, from)
    for (let i = from; i < to; i++) {
      const before = a[i + shift]!.attrs
      const after = b[i]!.attrs
      const len = b[i]!.key.startsWith('\u0000') ? 1 : b[i]!.key.length
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        const change: Record<string, unknown> = { ...(after ?? {}) }
        for (const k of Object.keys(before ?? {})) if (!(k in change)) change[k] = null
        text.format(pos, len, change)
      }
      pos += len
    }
  }
  formatRuns(0, start, 0)
  formatRuns(endB, b.length, endA - endB)
}

/** The inline leaf that is the `index`-th atom of `node`, as an embed. */
function embedAt(node: Node, index: number): Embed {
  let i = 0
  let found: Embed | null = null
  node.forEach((child) => {
    if (found) return
    const size = child.isText ? [...child.text].length : 1
    if (!child.isText && i === index) found = { type: child.type.name, attrs: { ...child.attrs } }
    i += size
  })
  return found ?? { type: 'hard_break' }
}

/** Writes the changes between two versions of the document into the Yjs fragment. */
export function updateFragment(fragment: Y.XmlFragment, oldDoc: Node, newDoc: Node): void {
  updateChildren(fragment, oldDoc, newDoc)
}

/** Replaces the fragment's content with the document (first client, or a reset). */
export function writeDoc(fragment: Y.XmlFragment, doc: Node): void {
  if (fragment.length) fragment.delete(0, fragment.length)
  const blocks: Y.XmlElement[] = []
  doc.forEach((b) => blocks.push(toY(b)))
  fragment.insert(0, blocks)
}
