import type { Attrs } from '../model/attrs.js'
import { Fragment } from '../model/fragment.js'
import { Mark } from '../model/mark.js'
import type { Node } from '../model/node.js'
import type { MarkType, NodeType, Schema } from '../model/schema.js'
import type { DOMLike, DOMLikeElement, ParseRule } from './types.js'

export interface HTMLParseOptions {
  /** Maximum DOM nesting depth (CLAUDE.md §5.10). Default 256. */
  maxDepth?: number
  /** Maximum number of created nodes. Default 200 000. */
  maxNodes?: number
}

/** Thrown when input exceeds the configured parse limits. */
export class HTMLLimitError extends RangeError {
  override name = 'HTMLLimitError'
}

/** Elements dropped with their whole subtree (CLAUDE.md §5.5). */
const SKIP_TAGS = new Set([
  'script', 'style', 'template', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'head', 'title', 'meta', 'link', 'base', 'svg', 'math', 'input', 'button', 'select',
  'textarea', 'option', 'canvas', 'audio', 'video', 'source', 'track', 'map', 'portal',
  'caption', // read as plain text by the table rule (a table attribute), never as content
]) // prettier-ignore

/**
 * Dropped tags a schema may still take, only as a block leaf whose rule checks it
 * (e.g. a video embed with a domain whitelist): their content is never read.
 */
const EMBED_TAGS = new Set(['iframe'])

/** Unknown elements that still separate blocks (their inline content gets its own paragraph). */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]) // prettier-ignore

interface Rule<T> {
  readonly type: T
  readonly rule: ParseRule
}

interface Context {
  readonly type: NodeType
  readonly attrs: Attrs | null
  readonly content: Node[]
  /** Created by the parser to hold stray inline content. */
  readonly auto: boolean
  /** Text so far ends with a space (or nothing yet): collapse the next leading space. */
  endsWithSpace: boolean
}

function rulesByTag<T>(
  entries: { type: T; rules: readonly ParseRule[] | undefined }[],
): Map<string, Rule<T>[]> {
  const map = new Map<string, Rule<T>[]>()
  for (const { type, rules } of entries) {
    for (const rule of rules ?? []) {
      const tag = rule.tag.toLowerCase()
      const list = map.get(tag) ?? []
      list.push({ type, rule })
      map.set(tag, list)
    }
  }
  for (const list of map.values())
    list.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50))
  return map
}

/**
 * Builds a document from HTML using the schema's `parseHTML` rules.
 * Whatever the schema does not know is dropped; text is kept.
 *
 * Feed it only inert trees: `new DOMParser().parseFromString(html, 'text/html').body`
 * in the browser, the `parse5` adapter on the server. Never an element of the live page.
 */
export class HTMLParser {
  private readonly nodeRules: Map<string, Rule<NodeType>[]>
  private readonly markRules: Map<string, Rule<MarkType>[]>

  constructor(
    readonly schema: Schema,
    readonly options: HTMLParseOptions = {},
  ) {
    this.nodeRules = rulesByTag(
      Object.values(schema.nodes).map((type) => ({ type, rules: type.spec.parseHTML })),
    )
    this.markRules = rulesByTag(
      Object.values(schema.marks).map((type) => ({ type, rules: type.spec.parseHTML })),
    )
  }

  /** Parses the children of `root` into a document (top node of the schema). */
  parse(root: DOMLike): Node {
    return new ParseRun(this, this.options).run(root)
  }

  /** @internal */
  matchNode(tag: string, el: DOMLikeElement): { type: NodeType; attrs: Attrs } | null {
    for (const { type, rule } of this.nodeRules.get(tag) ?? []) {
      const attrs = rule.getAttrs ? rule.getAttrs(el) : null
      if (attrs === false) continue
      try {
        return { type, attrs: type.computeAttrs(attrs) }
      } catch {
        // invalid or unsafe attributes (e.g. a javascript: URL): this rule does not apply
      }
    }
    return null
  }

  /** @internal */
  matchMarks(tag: string, el: DOMLikeElement): Mark[] {
    const marks: Mark[] = []
    for (const { type, rule } of this.markRules.get(tag) ?? []) {
      if (marks.some((m) => m.type === type)) continue
      const attrs = rule.getAttrs ? rule.getAttrs(el) : null
      if (attrs === false) continue
      try {
        marks.push(type.create(attrs))
      } catch {
        // unsafe attributes: drop the mark, keep the text
      }
    }
    return marks
  }
}

class ParseRun {
  private readonly stack: Context[]
  private marks: readonly Mark[] = Mark.none
  private nodeCount = 0
  private readonly maxDepth: number
  private readonly maxNodes: number

  constructor(
    private readonly parser: HTMLParser,
    options: HTMLParseOptions,
  ) {
    this.maxDepth = options.maxDepth ?? 256
    this.maxNodes = options.maxNodes ?? 200_000
    this.stack = [this.context(parser.schema.topNodeType, null, false)]
  }

  run(root: DOMLike): Node {
    this.walk(root, 0)
    while (this.stack.length > 1) this.close()
    const top = this.stack[0]!
    const content = Fragment.fromArray(top.content)
    return (
      top.type.createAndFill(null, content) ??
      top.type.createAndFill(null, this.fitting(top.type, top.content)) ??
      top.type.createAndFill()!
    )
  }

  private context(type: NodeType, attrs: Attrs | null, auto: boolean): Context {
    return { type, attrs, content: [], auto, endsWithSpace: true }
  }

  private get top(): Context {
    return this.stack[this.stack.length - 1]!
  }

  private count(): void {
    if (++this.nodeCount > this.maxNodes) throw new HTMLLimitError('HTML has too many nodes')
  }

  private walk(dom: DOMLike, depth: number): void {
    if (depth > this.maxDepth) throw new HTMLLimitError('HTML is nested too deeply')
    const children = dom.childNodes
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      if (child.nodeType === 3) this.addText(child.nodeValue ?? '')
      else if (child.nodeType === 1) this.addElement(child as DOMLikeElement, depth + 1)
      else if (child.nodeType === 9 || child.nodeType === 11) this.walk(child, depth + 1)
    }
  }

  private addElement(el: DOMLikeElement, depth: number): void {
    const tag = el.nodeName.toLowerCase()
    if (typeof el.getAttribute !== 'function') return
    if (SKIP_TAGS.has(tag)) {
      const embed = EMBED_TAGS.has(tag) ? this.parser.matchNode(tag, el) : null
      if (embed?.type.isLeaf && embed.type.isBlock) this.insertLeaf(embed.type, embed.attrs)
      return
    }
    const match = this.parser.matchNode(tag, el)
    if (match) {
      if (match.type.isLeaf) {
        // In code blocks, inline leaves (e.g. <br>) become their text equivalent.
        const leafText = match.type.spec.leafText
        if (match.type.isInline && this.top.type.spec.code && leafText) {
          this.addText(leafText(match.type.create(match.attrs)))
          return
        }
        this.insertLeaf(match.type, match.attrs)
        if (tag === 'br') this.top.endsWithSpace = true
      } else {
        const ctx = this.open(match.type, match.attrs)
        this.walk(el, depth)
        if (ctx) this.closeUntil(ctx)
      }
      return
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) this.closeAuto()
    const saved = this.marks
    for (const mark of this.parser.matchMarks(tag, el)) this.marks = mark.addToSet(this.marks)
    this.walk(el, depth)
    this.marks = saved
    if (block) this.closeAuto()
  }

  /** Closes contexts until one can hold `type`; returns false when none can. */
  private makeRoomFor(type: NodeType): boolean {
    let index = this.stack.length - 1
    while (index >= 0 && !this.stack[index]!.type.canContain(type)) index--
    if (index < 0) return false
    while (this.stack.length - 1 > index) this.close()
    return true
  }

  private open(type: NodeType, attrs: Attrs): Context | null {
    if (!this.makeRoomFor(type)) return null
    const ctx = this.context(type, attrs, false)
    this.stack.push(ctx)
    return ctx
  }

  private insertLeaf(type: NodeType, attrs: Attrs): void {
    this.count()
    if (type.isInline) return this.insertInline(type.create(attrs))
    if (this.makeRoomFor(type)) this.top.content.push(type.create(attrs))
  }

  /** Makes sure the top context accepts inline content of `type`, opening a paragraph if needed. */
  private inlineContext(type: NodeType): Context | null {
    const top = this.top
    if (top.type.canContain(type)) return top
    if (top.type.inlineContent) return null
    const expr = top.type.contentExpr
    const candidates = [...expr.allowedTypes()].filter(
      (t) => t.isTextblock && t.canContain(type) && !t.hasRequiredAttrs(),
    )
    let textblock = candidates[0]
    if (!textblock) return null
    // e.g. "title block+": text after the title goes into a paragraph, not a second title
    if (candidates.length > 1 && !expr.repeated) {
      const state = expr.matchFragment(Fragment.fromArray(top.content))
      textblock = (state && candidates.find((t) => expr.matchType(state, t))) || textblock
    }
    const ctx = this.context(textblock, null, true)
    this.stack.push(ctx)
    return ctx
  }

  private insertInline(node: Node): void {
    const ctx = this.inlineContext(node.type)
    if (!ctx) return
    ctx.content.push(node.mark(this.marks.filter((m) => ctx.type.allowsMarkType(m.type))))
    ctx.endsWithSpace = false
  }

  private addText(raw: string): void {
    const textType = this.parser.schema.nodes['text']!
    const code = !!this.top.type.spec.code
    let text = code ? raw.replace(/\r\n?/g, '\n') : raw.replace(/[ \t\n\r\f]+/g, ' ')
    if (!text) return
    if (!code && !this.top.type.inlineContent && !text.trim()) return
    const ctx = this.inlineContext(textType)
    if (!ctx) return
    if (!code && ctx.endsWithSpace && text.startsWith(' ')) text = text.slice(1)
    if (!text) return
    this.count()
    this.insertInline(this.parser.schema.text(text))
    ctx.endsWithSpace = !code && text.endsWith(' ')
  }

  private closeAuto(): void {
    while (this.stack.length > 1 && this.top.auto) this.close()
  }

  private closeUntil(ctx: Context): void {
    if (!this.stack.includes(ctx)) return
    while (this.stack.length > 1 && this.top !== ctx) this.close()
    if (this.top === ctx) this.close()
  }

  /** Keeps only the children that fit `type`'s content expression, in order. */
  private fitting(type: NodeType, content: readonly Node[]): Fragment {
    const kept: Node[] = []
    let state = type.contentExpr.start
    for (const child of content) {
      const next = type.contentExpr.matchType(state, child.type)
      if (next) {
        state = next
        kept.push(child)
      }
    }
    return Fragment.fromArray(kept)
  }

  /** `content` after the nodes its type requires first (e.g. an empty title), when it lacks them. */
  private fillStart(type: NodeType, content: readonly Node[]): Fragment | null {
    const first = content[0]
    if (!first) return null
    const expr = type.contentExpr
    const lead: Node[] = []
    let state = expr.start
    for (let i = 0; i < 4 && !expr.matchType(state, first.type); i++) {
      const needed = expr.defaultType(state)
      const node = needed?.createAndFill()
      const next = needed && node && expr.matchType(state, needed)
      if (!node || !next) return null
      lead.push(node)
      state = next
    }
    return Fragment.fromArray([...lead, ...content])
  }

  private close(): void {
    const ctx = this.stack.pop()!
    if (ctx.type.inlineContent && !ctx.type.spec.code) trimTrailingSpace(ctx.content)
    if (ctx.auto && !ctx.content.length) return
    this.count()
    const node =
      ctx.type.createAndFill(ctx.attrs, Fragment.fromArray(ctx.content)) ??
      ctx.type.createAndFill(ctx.attrs, this.fillStart(ctx.type, ctx.content)) ??
      ctx.type.createAndFill(ctx.attrs, this.fitting(ctx.type, ctx.content))
    if (node) this.top.content.push(node)
  }
}

function trimTrailingSpace(content: Node[]): void {
  const last = content[content.length - 1]
  if (!last?.isText || !last.text.endsWith(' ')) return
  const text = last.text.slice(0, -1)
  if (text) content[content.length - 1] = last.withText(text)
  else content.pop()
}
