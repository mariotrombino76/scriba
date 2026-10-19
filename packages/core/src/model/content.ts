import type { NodeType } from './schema.js'
import type { Fragment } from './fragment.js'

/** One term of a content expression: a set of allowed types repeated min..max times. */
export interface ContentElement {
  readonly types: readonly NodeType[]
  readonly min: number
  readonly max: number
}

/** Position of a matcher inside a content expression. */
export interface MatchState {
  readonly element: number
  readonly count: number
}

const START: MatchState = { element: 0, count: 0 }

/**
 * Compiled content expression, e.g. `"block+"`, `"inline*"`, `"(paragraph | heading) block*"`.
 *
 * Supported syntax: a sequence of terms, each a type/group name or a parenthesized
 * alternative of names, optionally followed by `*`, `+` or `?`.
 * Matching is greedy without backtracking, so adjacent terms should not overlap.
 */
export class ContentExpr {
  static readonly empty = new ContentExpr([])

  constructor(readonly elements: readonly ContentElement[]) {}

  get isEmpty(): boolean {
    return this.elements.length === 0
  }

  get start(): MatchState {
    return START
  }

  /**
   * The single term of an expression like `"block+"` or `"inline*"` (one set of types,
   * repeated without limit), or null. For these, checking a change needs only the new
   * nodes and the count, not every child (fast checks in large documents).
   */
  get repeated(): ContentElement | null {
    const el = this.elements.length === 1 ? this.elements[0]! : null
    return el && el.max === Infinity ? el : null
  }

  /** True when the expression only admits inline nodes. */
  get inlineContent(): boolean {
    const first = this.elements[0]?.types[0]
    return !!first && first.isInline
  }

  /** Advances the matcher by one node of `type`, or returns null when not allowed. */
  matchType(state: MatchState, type: NodeType): MatchState | null {
    let { element, count } = state
    while (element < this.elements.length) {
      const el = this.elements[element]!
      if (count < el.max && el.types.includes(type)) return { element, count: count + 1 }
      if (count < el.min) return null
      element++
      count = 0
    }
    return null
  }

  /** Matches a whole fragment (optionally a range of its children). */
  matchFragment(
    frag: Fragment,
    state = START,
    start = 0,
    end = frag.childCount,
  ): MatchState | null {
    let cur: MatchState | null = state
    for (let i = start; cur && i < end; i++) cur = this.matchType(cur, frag.child(i).type)
    return cur
  }

  /** True when the content may legally end at this state. */
  validEnd(state: MatchState): boolean {
    for (let i = state.element; i < this.elements.length; i++) {
      const count = i === state.element ? state.count : 0
      if (count < this.elements[i]!.min) return false
    }
    return true
  }

  /** First type that may be inserted at this state and can be created without input. */
  defaultType(state: MatchState): NodeType | null {
    let { element, count } = state
    while (element < this.elements.length) {
      const el = this.elements[element]!
      if (count < el.max) {
        const type = el.types.find((t) => !t.isText && !t.hasRequiredAttrs())
        if (type) return type
      }
      if (count < el.min) return null
      element++
      count = 0
    }
    return null
  }

  /** Every node type allowed somewhere in this expression. */
  allowedTypes(): Set<NodeType> {
    const set = new Set<NodeType>()
    for (const el of this.elements) for (const t of el.types) set.add(t)
    return set
  }

  /**
   * Creates the nodes required to make content valid from `state` to the end,
   * or returns null when a required node cannot be generated (e.g. text).
   */
  fillEnd(state: MatchState): NodeType[] | null {
    const types: NodeType[] = []
    for (let i = state.element; i < this.elements.length; i++) {
      const el = this.elements[i]!
      for (let count = i === state.element ? state.count : 0; count < el.min; count++) {
        const type = el.types.find((t) => !t.isText && !t.hasRequiredAttrs())
        if (!type) return null
        types.push(type)
      }
    }
    return types
  }
}

/** Parses a content expression against a lookup of names → node types. */
export function parseContentExpr(
  expr: string,
  resolve: (name: string) => readonly NodeType[],
): ContentExpr {
  const tokens = expr.match(/\w+|[()|*+?]/g) ?? []
  if (tokens.join('').length !== expr.replace(/\s+/g, '').length) {
    throw new SyntaxError(`Invalid characters in content expression "${expr}"`)
  }
  let pos = 0
  const next = (): string | undefined => tokens[pos]
  const fail = (msg: string): never => {
    throw new SyntaxError(`${msg} in content expression "${expr}"`)
  }

  const elements: ContentElement[] = []
  while (pos < tokens.length) {
    let types: NodeType[] = []
    const tok = tokens[pos++]!
    if (tok === '(') {
      for (;;) {
        const name = tokens[pos++]
        if (!name || !/^\w+$/.test(name)) fail('Expected a name')
        types.push(...resolve(name!))
        const sep = tokens[pos++]
        if (sep === ')') break
        if (sep !== '|') fail('Expected "|" or ")"')
      }
    } else if (/^\w+$/.test(tok)) {
      types = [...resolve(tok)]
    } else {
      fail(`Unexpected "${tok}"`)
    }
    let min = 1
    let max = 1
    const q = next()
    if (q === '*' || q === '+' || q === '?') {
      pos++
      min = q === '+' ? 1 : 0
      max = q === '?' ? 1 : Infinity
    }
    elements.push({ types: [...new Set(types)], min, max })
  }

  const inline = elements.flatMap((e) => e.types).map((t) => t.isInline)
  if (inline.some((v) => v !== inline[0])) fail('Mixing inline and block content')
  return new ContentExpr(elements)
}
