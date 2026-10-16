import type { MarkToHTML, NodeToHTML, ParseRule } from '../html/types.js'
import { computeAttrs, emptyAttrs, type Attrs, type AttrSpec } from './attrs.js'
import { ContentExpr, parseContentExpr } from './content.js'
import { Fragment } from './fragment.js'
import { Mark, type MarkJSON } from './mark.js'
import { Node, TextNode, type NodeJSON } from './node.js'

/** Describes a node type. */
export interface NodeSpec {
  /** Content expression, e.g. `"block+"` or `"inline*"`. Empty means leaf. */
  content?: string
  /** Space-separated groups this type belongs to, e.g. `"block"`. */
  group?: string
  /** Inline node (lives inside textblocks). */
  inline?: boolean
  /** Treated as a single unit by editing (no editable content). */
  atom?: boolean
  attrs?: Record<string, AttrSpec>
  /** Marks allowed in the content: space-separated names/groups, `"_"` for all, `""` for none. */
  marks?: string
  /** Contains code: marks off by default, whitespace preserved. */
  code?: boolean
  /** Keeps its type when its content is replaced (e.g. headings, list items). */
  defining?: boolean
  /** Editing operations do not cross its boundary (e.g. table cells). */
  isolating?: boolean
  /** Text used for this leaf node by `textBetween`. */
  leafText?: (node: Node) => string
  /** How HTML elements become this node (HTML import, paste). */
  parseHTML?: readonly ParseRule[]
  /** How this node is written as HTML. */
  toHTML?: NodeToHTML
  /** Any extra data (DOM rules, plugin config…). */
  [key: string]: unknown
}

/** Describes a mark type. */
export interface MarkSpec {
  attrs?: Record<string, AttrSpec>
  /** Whether typing at the mark's end continues it. Default true; false for links. */
  inclusive?: boolean
  /** Marks this one excludes: space-separated names/groups, `"_"` for all. Default: itself. */
  excludes?: string
  group?: string
  /** How HTML elements become this mark. */
  parseHTML?: readonly ParseRule[]
  /** How this mark is written as HTML (with a `0` hole for the text). */
  toHTML?: MarkToHTML
  /**
   * False: shown in the editor (its `toHTML`) but left out of the serialized
   * HTML (only its text is written), e.g. comment anchors and suggestions.
   */
  serialize?: boolean
  /**
   * An annotation (e.g. a comment anchor): adding or removing it does not
   * change the content, so people who may only comment can do it
   * (see `isAnnotationOnly`).
   */
  annotation?: boolean
  [key: string]: unknown
}

export interface NodeFromJSONOptions {
  /** Maximum nesting depth (untrusted input). Default 200. */
  maxDepth?: number
  /**
   * Accept nodes whose content is incomplete (missing required children), as
   * found in slices. Child types and marks are still checked; full validity is
   * enforced when the slice is inserted into a document.
   */
  partial?: boolean
}

export interface SchemaSpec<N extends string = string, M extends string = string> {
  nodes: Record<N, NodeSpec>
  marks?: Record<M, MarkSpec>
  /** Name of the root node type. Default `"doc"`. */
  topNode?: string
}

export class NodeType {
  readonly groups: readonly string[]
  readonly isText: boolean
  /** Set once all types exist. */
  contentExpr: ContentExpr = ContentExpr.empty
  /** Allowed marks in content; null = all. */
  markSet: readonly MarkType[] | null = null
  readonly defaultAttrs: Attrs | null

  constructor(
    readonly name: string,
    readonly schema: Schema,
    readonly spec: NodeSpec,
  ) {
    this.groups = spec.group ? spec.group.split(/\s+/) : []
    this.isText = name === 'text'
    this.defaultAttrs = this.hasRequiredAttrs() ? null : computeAttrs(spec.attrs ?? {}, null, name)
  }

  get isInline(): boolean {
    return !!this.spec.inline || this.isText
  }
  get isBlock(): boolean {
    return !this.isInline
  }
  get inlineContent(): boolean {
    return this.contentExpr.inlineContent
  }
  get isTextblock(): boolean {
    return this.isBlock && this.inlineContent
  }
  get isLeaf(): boolean {
    return this.contentExpr.isEmpty
  }
  get isAtom(): boolean {
    return this.isLeaf || !!this.spec.atom
  }

  hasRequiredAttrs(): boolean {
    return Object.values(this.spec.attrs ?? {}).some((a) => !('default' in a))
  }

  computeAttrs(attrs?: Record<string, unknown> | null): Attrs {
    if (!attrs && this.defaultAttrs) return this.defaultAttrs
    return computeAttrs(this.spec.attrs ?? {}, attrs, `node "${this.name}"`)
  }

  /** Creates a node without checking its content. */
  create(
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[] | null,
  ): Node {
    if (this.isText) throw new RangeError('Use schema.text() to create text nodes')
    return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks))
  }

  /** Creates a node and throws if its content is not valid. */
  createChecked(
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[] | null,
  ): Node {
    const frag = Fragment.from(content)
    if (!this.validContent(frag)) throw new RangeError(`Invalid content for node ${this.name}`)
    return this.create(attrs, frag, marks)
  }

  /**
   * Creates a node, adding required children at the end when needed
   * (e.g. an empty table gets a row and a cell). Returns null if impossible.
   */
  createAndFill(
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[] | null,
  ): Node | null {
    const frag = Fragment.from(content)
    const state = this.contentExpr.matchFragment(frag)
    if (!state) return null
    const missing = this.contentExpr.fillEnd(state)
    if (!missing) return null
    const extra: Node[] = []
    for (const type of missing) {
      const node = type.createAndFill()
      if (!node) return null
      extra.push(node)
    }
    const full = frag.append(Fragment.fromArray(extra))
    if (!this.validContent(full)) return null
    return this.create(attrs, full, marks)
  }

  /** True when the fragment is valid content (child types and marks). */
  validContent(content: Fragment): boolean {
    const state = this.contentExpr.matchFragment(content)
    if (!state || !this.contentExpr.validEnd(state)) return false
    for (const child of content.content) {
      if (!this.allowsMarks(child.marks)) return false
    }
    return true
  }

  allowsMarkType(type: MarkType): boolean {
    return this.markSet === null || this.markSet.includes(type)
  }

  allowsMarks(marks: readonly Mark[]): boolean {
    return this.markSet === null || marks.every((m) => this.allowsMarkType(m.type))
  }

  /** True when `type` may appear in this node's content. */
  canContain(type: NodeType): boolean {
    return this.contentExpr.allowedTypes().has(type)
  }

  /** True when the two types accept the same kind of content (so they can be joined). */
  compatibleContent(other: NodeType): boolean {
    if (this === other) return true
    const a = this.contentExpr.allowedTypes()
    const b = other.contentExpr.allowedTypes()
    return [...b].every((t) => a.has(t))
  }
}

export class MarkType {
  readonly defaultAttrs: Attrs | null
  /** Set once all types exist. */
  excluded: readonly MarkType[] = []
  readonly groups: readonly string[]
  private instance: Mark | null

  constructor(
    readonly name: string,
    readonly rank: number,
    readonly schema: Schema,
    readonly spec: MarkSpec,
  ) {
    this.groups = spec.group ? spec.group.split(/\s+/) : []
    const required = Object.values(spec.attrs ?? {}).some((a) => !('default' in a))
    this.defaultAttrs = required ? null : computeAttrs(spec.attrs ?? {}, null, name)
    this.instance =
      this.defaultAttrs && !Object.keys(this.defaultAttrs).length
        ? new Mark(this, emptyAttrs)
        : null
  }

  create(attrs?: Record<string, unknown> | null): Mark {
    if (!attrs && this.instance) return this.instance
    return new Mark(this, computeAttrs(this.spec.attrs ?? {}, attrs, `mark "${this.name}"`))
  }

  excludes(other: MarkType): boolean {
    return this.excluded.includes(other)
  }

  /** First mark of this type in the set, if any. */
  isInSet(set: readonly Mark[]): Mark | undefined {
    return set.find((m) => m.type === this)
  }

  removeFromSet(set: readonly Mark[]): readonly Mark[] {
    return set.filter((m) => m.type !== this)
  }
}

/**
 * The "instruction manual" of a document: which node and mark types exist and
 * where they may appear. Every document is built from exactly one schema.
 */
export class Schema<N extends string = string, M extends string = string> {
  readonly nodes: Readonly<Record<N, NodeType>>
  readonly marks: Readonly<Record<M, MarkType>>
  readonly topNodeType: NodeType

  constructor(readonly spec: SchemaSpec<N, M>) {
    const nodes = {} as Record<string, NodeType>
    for (const name of Object.keys(spec.nodes)) {
      nodes[name] = new NodeType(name, this, spec.nodes[name as N])
    }
    const marks = {} as Record<string, MarkType>
    Object.keys(spec.marks ?? {}).forEach((name, rank) => {
      marks[name] = new MarkType(name, rank, this, spec.marks![name as M])
    })
    this.nodes = nodes as Record<N, NodeType>
    this.marks = marks as Record<M, MarkType>

    const topName = spec.topNode ?? 'doc'
    const top = nodes[topName]
    if (!top) throw new RangeError(`Schema is missing its top node type "${topName}"`)
    if (!nodes['text']) throw new RangeError('Every schema needs a "text" node type')
    if (nodes['text'].spec.attrs)
      throw new RangeError('The text node type should not have attributes')
    this.topNodeType = top

    const nodeList = Object.values(nodes)
    const markList = Object.values(marks)
    for (const type of nodeList) {
      const resolve = (name: string): NodeType[] => {
        const direct = nodes[name]
        if (direct) return [direct]
        const group = nodeList.filter((t) => t.groups.includes(name))
        if (!group.length)
          throw new SyntaxError(`Unknown node type or group "${name}" in ${type.name}`)
        return group
      }
      type.contentExpr = type.spec.content
        ? parseContentExpr(type.spec.content, resolve)
        : ContentExpr.empty
    }
    for (const type of nodeList) {
      const markExpr = type.spec.marks ?? (type.spec.code || !type.inlineContent ? '' : '_')
      type.markSet = markExpr === '_' ? null : resolveMarks(markList, markExpr, type.name)
    }
    for (const type of markList) {
      const excl = type.spec.excludes
      type.excluded =
        excl == null ? [type] : excl === '_' ? markList : resolveMarks(markList, excl, type.name)
    }
  }

  /** Creates a text node. */
  text(text: string, marks?: readonly Mark[] | null): Node {
    return new TextNode(this.nodes['text' as N], emptyAttrs, text, Mark.setFrom(marks))
  }

  node(
    type: string | NodeType,
    attrs?: Record<string, unknown> | null,
    content?: Fragment | Node | readonly Node[] | null,
    marks?: readonly Mark[] | null,
  ): Node {
    return this.nodeType(type).create(attrs, content, marks)
  }

  mark(type: string | MarkType, attrs?: Record<string, unknown> | null): Mark {
    const markType = typeof type === 'string' ? this.marks[type as M] : type
    if (!markType) throw new RangeError(`Unknown mark type "${String(type)}"`)
    return markType.create(attrs)
  }

  nodeType(type: string | NodeType): NodeType {
    const found = typeof type === 'string' ? this.nodes[type as N] : type
    if (!found || found.schema !== (this as Schema))
      throw new RangeError(`Unknown node type "${String(type)}"`)
    return found
  }

  /**
   * Deserializes and validates a node from JSON. Throws on anything the schema rejects.
   * JSON is untrusted input: nesting is limited by `maxDepth` (default 200).
   */
  nodeFromJSON(json: NodeJSON, options: NodeFromJSONOptions = {}): Node {
    return this.readNode(json, options.maxDepth ?? 200, options.partial ?? false)
  }

  private readNode(json: NodeJSON, depthLeft: number, partial: boolean): Node {
    if (!json || typeof json !== 'object' || typeof json.type !== 'string') {
      throw new RangeError('Invalid node JSON')
    }
    if (depthLeft <= 0) throw new RangeError('Node JSON exceeds the maximum nesting depth')
    if (json.marks !== undefined && !Array.isArray(json.marks))
      throw new RangeError('Invalid marks JSON')
    const marks = (json.marks ?? []).map((m) => this.markFromJSON(m))
    if (json.type === 'text') {
      if (typeof json.text !== 'string') throw new RangeError('Invalid text node JSON')
      return this.text(json.text, marks)
    }
    if (json.attrs !== undefined && (typeof json.attrs !== 'object' || json.attrs === null)) {
      throw new RangeError('Invalid attrs JSON')
    }
    if (json.content !== undefined && !Array.isArray(json.content))
      throw new RangeError('Invalid content JSON')
    const children = (json.content ?? []).map((c) => this.readNode(c, depthLeft - 1, partial))
    const type = this.nodeType(json.type)
    if (!partial) return type.createChecked(json.attrs, children, marks)
    // Partial content (slices): children must be of allowed types, in order, but may be incomplete.
    const content = Fragment.fromArray(children)
    if (
      !type.contentExpr.matchFragment(content) ||
      !content.content.every((c) => type.allowsMarks(c.marks))
    ) {
      throw new RangeError(`Invalid content for node ${type.name}`)
    }
    return type.create(json.attrs, content, marks)
  }

  markFromJSON(json: MarkJSON): Mark {
    if (!json || typeof json !== 'object' || typeof json.type !== 'string')
      throw new RangeError('Invalid mark JSON')
    if (json.attrs !== undefined && (typeof json.attrs !== 'object' || json.attrs === null)) {
      throw new RangeError('Invalid mark attrs JSON')
    }
    return this.mark(json.type, json.attrs)
  }
}

function resolveMarks(marks: readonly MarkType[], expr: string, owner: string): MarkType[] {
  const result: MarkType[] = []
  for (const name of expr.split(/\s+/).filter(Boolean)) {
    const found = marks.filter((m) => m.name === name || m.groups.includes(name))
    if (!found.length) throw new SyntaxError(`Unknown mark type or group "${name}" in ${owner}`)
    result.push(...found)
  }
  return result
}
