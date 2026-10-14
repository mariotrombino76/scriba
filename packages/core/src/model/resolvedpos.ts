import { Mark } from './mark.js'
import type { Node } from './node.js'

/**
 * A position with its full context: the chain of ancestor nodes, the child
 * index at every depth and the offset inside the innermost parent.
 *
 * Depth 0 is the document; `depth` is the innermost node containing the position.
 */
export class ResolvedPos {
  private constructor(
    /** Absolute position. */
    readonly pos: number,
    private readonly nodes: readonly Node[],
    private readonly indices: readonly number[],
    private readonly starts: readonly number[],
    /** Offset of the position inside the innermost parent's content. */
    readonly parentOffset: number,
    /** Offset inside the text node at the position (0 when between nodes). */
    readonly textOffset: number,
  ) {}

  static resolve(doc: Node, pos: number): ResolvedPos {
    if (!(pos >= 0 && pos <= doc.content.size)) throw new RangeError(`Position ${pos} out of range`)
    const nodes: Node[] = []
    const indices: number[] = []
    const starts: number[] = []
    let node = doc
    let start = 0
    let rem = pos
    for (;;) {
      const { index, offset } = node.content.findIndex(rem)
      nodes.push(node)
      indices.push(index)
      starts.push(start)
      const inside = rem - offset
      const child = node.maybeChild(index)
      if (inside === 0 || !child) return new ResolvedPos(pos, nodes, indices, starts, rem, 0)
      if (child.isText) return new ResolvedPos(pos, nodes, indices, starts, rem, inside)
      node = child
      start += offset + 1
      rem = inside - 1
    }
  }

  get depth(): number {
    return this.nodes.length - 1
  }

  get doc(): Node {
    return this.nodes[0]!
  }

  /** The innermost node containing the position. */
  get parent(): Node {
    return this.nodes[this.nodes.length - 1]!
  }

  private d(depth: number | null | undefined): number {
    if (depth == null) return this.depth
    return depth < 0 ? this.depth + depth : depth
  }

  /** Ancestor at a depth (negative counts from the innermost). */
  node(depth?: number | null): Node {
    const node = this.nodes[this.d(depth)]
    if (!node) throw new RangeError(`Depth ${depth} out of range`)
    return node
  }

  /** Index of the child the position points into, at a depth. */
  index(depth?: number | null): number {
    return this.indices[this.d(depth)]!
  }

  /** Index of the child after the position, at a depth. */
  indexAfter(depth?: number | null): number {
    const d = this.d(depth)
    return this.indices[d]! + (d === this.depth && !this.textOffset ? 0 : 1)
  }

  /** Position where the content of the ancestor at `depth` starts. */
  start(depth?: number | null): number {
    return this.starts[this.d(depth)]!
  }

  /** Position where the content of the ancestor at `depth` ends. */
  end(depth?: number | null): number {
    const d = this.d(depth)
    return this.starts[d]! + this.nodes[d]!.content.size
  }

  /** Position directly before the ancestor at `depth` (depth ≥ 1). */
  before(depth?: number | null): number {
    const d = this.d(depth)
    if (d < 1) throw new RangeError('There is no position before the top-level node')
    return this.starts[d]! - 1
  }

  /** Position directly after the ancestor at `depth` (depth ≥ 1). */
  after(depth?: number | null): number {
    const d = this.d(depth)
    if (d < 1) throw new RangeError('There is no position after the top-level node')
    return this.end(d) + 1
  }

  /** Node directly after the position (text cut at the position). */
  get nodeAfter(): Node | null {
    const child = this.parent.maybeChild(this.index())
    if (!child) return null
    return this.textOffset ? child.cut(this.textOffset) : child
  }

  /** Node directly before the position (text cut at the position). */
  get nodeBefore(): Node | null {
    const index = this.index()
    if (this.textOffset) return this.parent.child(index).cut(0, this.textOffset)
    return index > 0 ? this.parent.child(index - 1) : null
  }

  /**
   * Marks that text typed at this position would get: the marks of the text
   * before it, minus non-inclusive marks (like links) that do not continue after it.
   */
  marks(): readonly Mark[] {
    const parent = this.parent
    if (!parent.content.size) return Mark.none
    if (this.textOffset) return parent.child(this.index()).marks
    const before = this.nodeBefore
    const after = this.nodeAfter
    if (!before) return after ? after.marks : Mark.none
    let marks = before.marks
    for (const mark of before.marks) {
      if (mark.type.spec.inclusive === false && (!after || !mark.isInSet(after.marks))) {
        marks = mark.removeFromSet(marks)
      }
    }
    return marks
  }

  /** Deepest depth whose node contains both this position and `pos`. */
  sharedDepth(pos: number): number {
    for (let d = this.depth; d > 0; d--) {
      if (this.start(d) <= pos && this.end(d) >= pos) return d
    }
    return 0
  }

  sameParent(other: ResolvedPos): boolean {
    return this.depth === other.depth && this.start() === other.start() && this.doc === other.doc
  }

  toString(): string {
    let str = ''
    for (let d = 1; d <= this.depth; d++) {
      str += (str ? '/' : '') + this.node(d).type.name + '_' + this.index(d - 1)
    }
    return `${str}:${this.parentOffset}`
  }
}
