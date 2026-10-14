import { Mark } from './mark.js'
import type { Node, NodeJSON } from './node.js'
import type { NodeFromJSONOptions, Schema } from './schema.js'

/** Callback for tree walks. Return `false` to skip the node's children. */
export type NodeVisitor = (node: Node, pos: number, parent: Node | null, index: number) => unknown

/**
 * Immutable, ordered sequence of child nodes.
 * Adjacent text nodes with the same marks are always merged.
 */
export class Fragment {
  static readonly empty = new Fragment([], 0)

  private constructor(
    readonly content: readonly Node[],
    /** Total size in document positions. */
    readonly size: number,
  ) {}

  /** Builds a fragment, merging adjacent compatible text nodes and dropping empty text. */
  static fromArray(nodes: readonly Node[]): Fragment {
    if (!nodes.length) return Fragment.empty
    const out: Node[] = []
    let size = 0
    for (const node of nodes) {
      if (node.isText && !node.text) continue
      size += node.nodeSize
      const last = out[out.length - 1]
      if (last && node.isText && last.isText && Mark.sameSet(last.marks, node.marks)) {
        out[out.length - 1] = last.withText(last.text + node.text)
      } else {
        out.push(node)
      }
    }
    return out.length ? new Fragment(out, size) : Fragment.empty
  }

  static from(nodes: Fragment | Node | readonly Node[] | null | undefined): Fragment {
    if (!nodes) return Fragment.empty
    if (nodes instanceof Fragment) return nodes
    if (Array.isArray(nodes)) return Fragment.fromArray(nodes as readonly Node[])
    return Fragment.fromArray([nodes as Node])
  }

  static fromJSON(
    schema: Schema,
    json: readonly NodeJSON[] | undefined,
    options: NodeFromJSONOptions = {},
  ): Fragment {
    if (!json) return Fragment.empty
    if (!Array.isArray(json)) throw new RangeError('Invalid fragment JSON')
    return Fragment.fromArray(json.map((n: NodeJSON) => schema.nodeFromJSON(n, options)))
  }

  get childCount(): number {
    return this.content.length
  }

  get firstChild(): Node | null {
    return this.content[0] ?? null
  }

  get lastChild(): Node | null {
    return this.content[this.content.length - 1] ?? null
  }

  child(index: number): Node {
    const node = this.content[index]
    if (!node)
      throw new RangeError(`Index ${index} out of range for fragment of ${this.childCount}`)
    return node
  }

  maybeChild(index: number): Node | null {
    return this.content[index] ?? null
  }

  forEach(f: (node: Node, offset: number, index: number) => void): void {
    let pos = 0
    this.content.forEach((child, i) => {
      f(child, pos, i)
      pos += child.nodeSize
    })
  }

  /**
   * Finds the child at a position. Returns the child index and the position of its start.
   * A position on a boundary between children resolves to the child after it.
   */
  findIndex(pos: number): { index: number; offset: number } {
    if (pos === 0) return { index: 0, offset: 0 }
    if (pos === this.size) return { index: this.content.length, offset: this.size }
    if (pos < 0 || pos > this.size) throw new RangeError(`Position ${pos} outside of fragment`)
    let cur = 0
    for (let i = 0; ; i++) {
      const end = cur + this.child(i).nodeSize
      if (end > pos) return { index: i, offset: cur }
      if (end === pos) return { index: i + 1, offset: end }
      cur = end
    }
  }

  /** Calls `f` for every descendant overlapping [from, to). */
  nodesBetween(
    from: number,
    to: number,
    f: NodeVisitor,
    start = 0,
    parent: Node | null = null,
  ): void {
    let pos = 0
    for (let i = 0; pos < to && i < this.content.length; i++) {
      const child = this.content[i]!
      const end = pos + child.nodeSize
      if (end > from && f(child, start + pos, parent, i) !== false && child.content.size) {
        const inner = pos + 1
        child.content.nodesBetween(
          Math.max(0, from - inner),
          Math.min(child.content.size, to - inner),
          f,
          start + inner,
          child,
        )
      }
      pos = end
    }
  }

  /** Concatenated text between two positions, with `blockSeparator` between blocks. */
  textBetween(from: number, to: number, blockSeparator = '', leafText = ''): string {
    let text = ''
    let first = true
    this.nodesBetween(from, to, (node, pos) => {
      if (node.isText) {
        text += node.text.slice(Math.max(from, pos) - pos, to - pos)
      } else if (node.isLeaf) {
        text += node.type.spec.leafText ? node.type.spec.leafText(node) : leafText
      } else if (node.isBlock && !first) {
        text += blockSeparator
      }
      if (node.isBlock) first = false
    })
    return text
  }

  append(other: Fragment): Fragment {
    if (!other.size) return this
    if (!this.size) return other
    return Fragment.fromArray([...this.content, ...other.content])
  }

  /** Cuts out the content between two positions, splitting nodes at the edges. */
  cut(from: number, to = this.size): Fragment {
    if (from <= 0 && to >= this.size) return this
    const out: Node[] = []
    if (to > from) {
      let pos = 0
      for (const child of this.content) {
        const end = pos + child.nodeSize
        if (end > from && pos < to) {
          if (pos < from || end > to) {
            const inner = child.isText ? pos : pos + 1
            const innerSize = child.isText ? child.text.length : child.content.size
            out.push(child.cut(Math.max(0, from - inner), Math.min(innerSize, to - inner)))
          } else {
            out.push(child)
          }
        }
        if (end >= to) break
        pos = end
      }
    }
    return Fragment.fromArray(out)
  }

  replaceChild(index: number, node: Node): Fragment {
    if (this.content[index] === node) return this
    const copy = this.content.slice()
    copy[index] = node
    return Fragment.fromArray(copy)
  }

  eq(other: Fragment): boolean {
    if (this.content.length !== other.content.length) return false
    return this.content.every((n, i) => n.eq(other.content[i]!))
  }

  toJSON(): NodeJSON[] | undefined {
    return this.content.length ? this.content.map((n) => n.toJSON()) : undefined
  }

  toString(): string {
    return this.content.map((n) => n.toString()).join(', ')
  }
}
