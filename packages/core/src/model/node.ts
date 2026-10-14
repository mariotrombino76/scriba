import { Fragment, type NodeVisitor } from './fragment.js'
import { Mark, type MarkJSON } from './mark.js'
import { attrsEqual, type Attrs } from './attrs.js'
import type { MarkType, NodeType } from './schema.js'
import { ResolvedPos } from './resolvedpos.js'
import { Slice } from './slice.js'
import { replace } from './replace.js'

/** JSON representation of a node. */
export interface NodeJSON {
  type: string
  attrs?: Record<string, unknown>
  content?: NodeJSON[]
  marks?: MarkJSON[]
  text?: string
}

/**
 * Immutable document node. A document is a tree of nodes; positions count
 * one token for each node boundary and one for each character of text.
 */
export class Node {
  constructor(
    readonly type: NodeType,
    readonly attrs: Attrs,
    readonly content: Fragment,
    readonly marks: readonly Mark[] = Mark.none,
  ) {}

  /** Text of a text node; empty string for other nodes. */
  get text(): string {
    return ''
  }

  /** Size in positions: 1 for leaves, text length for text, content + 2 otherwise. */
  get nodeSize(): number {
    return this.isLeaf ? 1 : 2 + this.content.size
  }

  get childCount(): number {
    return this.content.childCount
  }

  get firstChild(): Node | null {
    return this.content.firstChild
  }

  get lastChild(): Node | null {
    return this.content.lastChild
  }

  child(index: number): Node {
    return this.content.child(index)
  }

  maybeChild(index: number): Node | null {
    return this.content.maybeChild(index)
  }

  forEach(f: (node: Node, offset: number, index: number) => void): void {
    this.content.forEach(f)
  }

  get isBlock(): boolean {
    return this.type.isBlock
  }
  get isInline(): boolean {
    return this.type.isInline
  }
  get isText(): boolean {
    return this.type.isText
  }
  get isTextblock(): boolean {
    return this.type.isTextblock
  }
  get isLeaf(): boolean {
    return this.type.isLeaf
  }
  get isAtom(): boolean {
    return this.type.isAtom
  }
  get inlineContent(): boolean {
    return this.type.inlineContent
  }

  get textContent(): string {
    return this.textBetween(0, this.content.size)
  }

  textBetween(from: number, to: number, blockSeparator = '', leafText = ''): string {
    return this.content.textBetween(from, to, blockSeparator, leafText)
  }

  /** Walks descendants overlapping [from, to); positions are relative to this node's content. */
  nodesBetween(from: number, to: number, f: NodeVisitor, startPos = 0): void {
    this.content.nodesBetween(from, to, f, startPos, this)
  }

  descendants(f: NodeVisitor): void {
    this.nodesBetween(0, this.content.size, f)
  }

  /** Same type, attrs and marks (content ignored). */
  sameMarkup(other: Node): boolean {
    return this.hasMarkup(other.type, other.attrs, other.marks)
  }

  hasMarkup(type: NodeType, attrs?: Attrs | null, marks: readonly Mark[] = Mark.none): boolean {
    return (
      this.type === type &&
      attrsEqual(this.attrs, attrs ?? type.defaultAttrs ?? {}) &&
      Mark.sameSet(this.marks, marks)
    )
  }

  eq(other: Node): boolean {
    return this === other || (this.sameMarkup(other) && this.content.eq(other.content))
  }

  /** Same markup, new content. */
  copy(content: Fragment = Fragment.empty): Node {
    if (content === this.content) return this
    return new Node(this.type, this.attrs, content, this.marks)
  }

  /** Same node with a different mark set. */
  mark(marks: readonly Mark[]): Node {
    return marks === this.marks ? this : new Node(this.type, this.attrs, this.content, marks)
  }

  /** Replaces the text of a text node. */
  withText(_text: string): Node {
    throw new RangeError(`Node of type ${this.type.name} has no text`)
  }

  /** Copy containing only the content between two positions. */
  cut(from: number, to = this.content.size): Node {
    if (from === 0 && to === this.content.size) return this
    return this.copy(this.content.cut(from, to))
  }

  /** The content between two positions as a (possibly open) slice. */
  slice(from: number, to = this.content.size): Slice {
    if (from === to) return Slice.empty
    const $from = this.resolve(from)
    const $to = this.resolve(to)
    const depth = $from.sharedDepth(to)
    const start = $from.start(depth)
    const content = $from.node(depth).content.cut($from.pos - start, $to.pos - start)
    return new Slice(content, $from.depth - depth, $to.depth - depth)
  }

  /** Replaces [from, to) with a slice. Throws `ReplaceError` if the result is invalid. */
  replace(from: number, to: number, slice: Slice): Node {
    return replace(this.resolve(from), this.resolve(to), slice)
  }

  /** The node directly after a position (null inside text). */
  nodeAt(pos: number): Node | null {
    let node: Node = this
    for (;;) {
      const { index, offset } = node.content.findIndex(pos)
      const child = node.maybeChild(index)
      if (!child) return null
      if (offset === pos || child.isText) return child
      node = child
      pos -= offset + 1
    }
  }

  /** Resolves a position to its full path through the tree. */
  resolve(pos: number): ResolvedPos {
    return ResolvedPos.resolve(this, pos)
  }

  /** True when any inline node in [from, to) has a mark of this type. */
  rangeHasMark(from: number, to: number, type: MarkType): boolean {
    let found = false
    if (to > from) {
      this.nodesBetween(from, to, (node) => {
        if (type.isInSet(node.marks)) found = true
        return !found
      })
    }
    return found
  }

  /** Throws when the node (deeply) does not conform to its schema. */
  check(): void {
    if (!this.type.validContent(this.content)) {
      throw new RangeError(`Invalid content for node ${this.type.name}: ${this.content.toString()}`)
    }
    let marks: readonly Mark[] = Mark.none
    for (const mark of this.marks) marks = mark.addToSet(marks)
    if (!Mark.sameSet(marks, this.marks)) {
      throw new RangeError(`Invalid mark set on node ${this.type.name}`)
    }
    this.content.forEach((child) => child.check())
  }

  toJSON(): NodeJSON {
    const json: NodeJSON = { type: this.type.name }
    if (Object.keys(this.attrs).length) json.attrs = { ...this.attrs }
    const content = this.content.toJSON()
    if (content) json.content = content
    if (this.marks.length) json.marks = this.marks.map((m) => m.toJSON())
    return json
  }

  toString(): string {
    const name = this.type.name
    const inner = this.content.size ? `(${this.content.toString()})` : ''
    return wrapMarks(this.marks, name + inner)
  }
}

/** A text node. Its marks carry the inline formatting. */
export class TextNode extends Node {
  constructor(
    type: NodeType,
    attrs: Attrs,
    private readonly value: string,
    marks: readonly Mark[] = Mark.none,
  ) {
    super(type, attrs, Fragment.empty, marks)
    if (!value) throw new RangeError('Empty text nodes are not allowed')
  }

  override get text(): string {
    return this.value
  }

  override get nodeSize(): number {
    return this.value.length
  }

  override get textContent(): string {
    return this.value
  }

  override textBetween(from: number, to: number): string {
    return this.value.slice(from, to)
  }

  override eq(other: Node): boolean {
    return this === other || (this.sameMarkup(other) && this.value === other.text)
  }

  override mark(marks: readonly Mark[]): Node {
    return marks === this.marks ? this : new TextNode(this.type, this.attrs, this.value, marks)
  }

  override withText(text: string): Node {
    return text === this.value ? this : new TextNode(this.type, this.attrs, text, this.marks)
  }

  override cut(from: number, to = this.value.length): Node {
    if (from === 0 && to === this.value.length) return this
    return this.withText(this.value.slice(from, to))
  }

  override toJSON(): NodeJSON {
    const json = super.toJSON()
    json.text = this.value
    return json
  }

  override toString(): string {
    return wrapMarks(this.marks, JSON.stringify(this.value))
  }
}

function wrapMarks(marks: readonly Mark[], str: string): string {
  for (let i = marks.length - 1; i >= 0; i--) str = `${marks[i]!.type.name}(${str})`
  return str
}
