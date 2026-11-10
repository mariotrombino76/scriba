import type { HTMLAttrs, HTMLSpec } from '@scriba-editor/core'

/**
 * The MathML the editor writes (approved 2026-10-26): generated here from
 * KaTeX's tree, never copied from the input. Only presentation elements and
 * a few attributes with checked values; no `maction`, `annotation-xml`,
 * `semantics` with HTML, links, classes or styles.
 */
const TAGS = new Set([
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace', 'msup',
  'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mfrac', 'msqrt', 'mroot', 'mstyle',
  'mpadded', 'mphantom', 'menclose', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'merror',
  'mmultiscripts', 'mprescripts', 'none',
]) // prettier-ignore

const LENGTH = /^-?\d{0,4}(?:\.\d{1,4})?(?:em|ex|pt|px|mu|%)?$/
const WORDS = /^[a-z]+(?: [a-z]+)*$/i
const ATTRS: Readonly<Record<string, RegExp>> = {
  xmlns: /^http:\/\/www\.w3\.org\/1998\/Math\/MathML$/,
  display: /^(?:block|inline)$/,
  encoding: /^application\/x-tex$/,
  mathvariant: /^[a-z-]{3,24}$/,
  stretchy: /^(?:true|false)$/,
  fence: /^(?:true|false)$/,
  separator: /^(?:true|false)$/,
  accent: /^(?:true|false)$/,
  accentunder: /^(?:true|false)$/,
  movablelimits: /^(?:true|false)$/,
  symmetric: /^(?:true|false)$/,
  largeop: /^(?:true|false)$/,
  displaystyle: /^(?:true|false)$/,
  scriptlevel: /^[+-]?\d$/,
  lspace: LENGTH,
  rspace: LENGTH,
  minsize: LENGTH,
  maxsize: LENGTH,
  width: LENGTH,
  height: LENGTH,
  depth: LENGTH,
  voffset: LENGTH,
  linethickness: LENGTH,
  columnalign: WORDS,
  rowalign: WORDS,
  columnlines: WORDS,
  rowlines: WORDS,
  columnspacing: /^(?:-?\d{0,4}(?:\.\d{1,4})?(?:em|ex|pt|px)? ?){1,20}$/,
  rowspacing: /^(?:-?\d{0,4}(?:\.\d{1,4})?(?:em|ex|pt|px)? ?){1,20}$/,
  frame: /^(?:none|solid|dashed)$/,
  notation: WORDS,
  mathcolor: /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i,
  mathbackground: /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i,
}

/** KaTeX's tree nodes, as far as we read them (its own objects, not user input). */
interface TreeNode {
  readonly type?: unknown
  readonly text?: unknown
  readonly attributes?: unknown
  readonly children?: unknown
}

const MAX_NODES = 20_000

/**
 * Converts KaTeX's MathML tree (from `__renderToDomTree` with `output: 'mathml'`)
 * into a `toHTML` spec: whitelisted elements and attributes, text as text.
 * Returns null when no `<math>` is found or the tree is too large.
 */
export function mathmlSpec(tree: unknown): HTMLSpec | null {
  let count = 0
  const convert = (node: TreeNode, depth: number): HTMLSpec | null => {
    if (++count > MAX_NODES || depth > 200) return null
    if (typeof node.text === 'string' && !Array.isArray(node.children)) return node.text
    const type = typeof node.type === 'string' ? node.type : null
    if (!type || !TAGS.has(type)) return null
    const attrs: Record<string, string> = {}
    if (node.attributes && typeof node.attributes === 'object')
      for (const [name, value] of Object.entries(node.attributes as Record<string, unknown>)) {
        const rule = ATTRS[name]
        if (rule && typeof value === 'string' && rule.test(value)) attrs[name] = value
      }
    const children: HTMLSpec[] = []
    let text = ''
    for (const child of Array.isArray(node.children) ? (node.children as TreeNode[]) : []) {
      const spec = convert(child, depth + 1)
      if (spec === null) continue
      // neighbouring text pieces become one (screen readers read them as one word)
      if (typeof spec === 'string') text += spec
      else {
        if (text) children.push(text)
        text = ''
        children.push(spec)
      }
    }
    if (text) children.push(text)
    return [type, attrs as HTMLAttrs, ...children] as unknown as HTMLSpec
  }
  // KaTeX wraps <math> in a <span class="katex">: find it
  const find = (node: TreeNode, depth: number): HTMLSpec | null => {
    if (depth > 4 || !node || typeof node !== 'object') return null
    if (node.type === 'math') return convert(node, 0)
    for (const child of Array.isArray(node.children) ? (node.children as TreeNode[]) : []) {
      const found = find(child, depth + 1)
      if (found) return found
    }
    return null
  }
  return find(tree as TreeNode, 0)
}

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

/** Builds real MathML elements from a spec (the editor's view; no markup strings). */
export function renderMathML(doc: Document, spec: HTMLSpec): Node {
  if (typeof spec === 'string') return doc.createTextNode(spec)
  const [tag, ...rest] = spec
  const el = doc.createElementNS(MATHML_NS, tag)
  for (const part of rest) {
    if (part && typeof part === 'object' && !Array.isArray(part)) {
      for (const [name, value] of Object.entries(part as HTMLAttrs))
        if (name !== 'xmlns' && typeof value === 'string') el.setAttribute(name, value)
    } else if (part !== 0) el.appendChild(renderMathML(doc, part as HTMLSpec))
  }
  return el
}
