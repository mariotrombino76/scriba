import { Fragment, type Node, type NodeJSON, type Schema } from '@scriba-editor/core'
import { plainText, type AiParse } from './session.js'

/**
 * What a "blocks" answer may contain (generative UI in the document): the
 * block types it may produce at the top level, and the marks its text may
 * carry. Inside them only containers, text and line breaks are allowed;
 * other leaves (images, mentions…) only when listed in `nodes`.
 */
export interface AiBlocks {
  /** Top-level block types, e.g. `['table']` or `['task']`. */
  nodes: readonly string[]
  /** Marks allowed on the text (default: bold, italic, underline, strike, code). */
  marks?: readonly string[]
}

/** Marks an answer may use by default: formatting only (no links, no comments or suggestions). */
export const DEFAULT_AI_MARKS: readonly string[] = ['bold', 'italic', 'underline', 'strike', 'code']

/** Most blocks in one answer, and most nodes in all (§5.10). */
export const MAX_AI_BLOCKS = 200
export const MAX_AI_NODES = 5000
/** Nesting allowed in one block (a table: table > row > cell > paragraph > text). */
const MAX_DEPTH = 12

const ALWAYS = new Set(['text', 'hard_break'])

/** Checks a parsed block against the allowed nodes and marks; counts its nodes. */
function allowed(
  block: Node,
  rules: AiBlocks,
  marks: ReadonlySet<string>,
  count: { n: number },
): boolean {
  if (!rules.nodes.includes(block.type.name)) return false
  let ok = true
  block.descendants((node) => {
    if (!ok) return false
    if (++count.n > MAX_AI_NODES) ok = false
    else if (node.marks.some((m) => !marks.has(m.type.name))) ok = false
    else if (node.isLeaf && !ALWAYS.has(node.type.name) && !rules.nodes.includes(node.type.name))
      ok = false
    return ok
  })
  return ok && ++count.n <= MAX_AI_NODES
}

/** Lines of the answer: Markdown code fences around them are tolerated (models add them). */
function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^```/.test(l))
}

/**
 * Parser for "blocks" answers (NDJSON: one JSON node per line, in Scriba's
 * JSON format). The answer is untrusted (§5.9): every line goes through the
 * schema (`nodeFromJSON`: types, attributes, URL whitelist, content, depth)
 * and the rules of `blocks`; invalid lines are dropped, lines that are not
 * JSON become paragraphs of text. While streaming, a line appears once it is
 * complete (a half-written line is not valid JSON yet).
 */
export function blocksParser(blocks: AiBlocks): AiParse {
  return (text: string, schema: Schema): Fragment => {
    const marks = new Set((blocks.marks ?? DEFAULT_AI_MARKS).filter((m) => schema.marks[m]))
    const out: Node[] = []
    const count = { n: 0 }
    for (const line of lines(text)) {
      if (out.length >= MAX_AI_BLOCKS || count.n >= MAX_AI_NODES) break
      if (!line.startsWith('{') && !line.startsWith('[')) {
        out.push(...plainText(line, schema).content)
        continue
      }
      let json: unknown
      try {
        json = JSON.parse(line)
      } catch {
        continue // incomplete (still streaming) or broken
      }
      for (const item of Array.isArray(json) ? json : [json]) {
        try {
          const node = schema.nodeFromJSON(item as NodeJSON, { maxDepth: MAX_DEPTH })
          if (node.isBlock && allowed(node, blocks, marks, count)) out.push(node)
        } catch {
          // rejected by the schema: dropped
        }
      }
    }
    return Fragment.fromArray(out)
  }
}

type JSONSchema = Record<string, unknown>

/**
 * JSON Schema of one block, for your backend: give it to the model as a tool
 * or structured output definition. It describes the shape; the editor still
 * checks everything against the schema when the answer arrives.
 */
export function aiBlocksJsonSchema(schema: Schema, blocks: AiBlocks): JSONSchema {
  const marks = (blocks.marks ?? DEFAULT_AI_MARKS).filter((m) => schema.marks[m])
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: '#/$defs/block',
    $defs: {
      block: {
        type: 'object',
        properties: {
          type: { enum: blocks.nodes.filter((n) => schema.nodes[n]) },
          attrs: { type: 'object' },
          content: { type: 'array', items: { $ref: '#/$defs/node' } },
        },
        required: ['type'],
        additionalProperties: false,
      },
      node: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          attrs: { type: 'object' },
          text: { type: 'string' },
          marks: {
            type: 'array',
            items: {
              type: 'object',
              properties: { type: { enum: marks } },
              required: ['type'],
            },
          },
          content: { type: 'array', items: { $ref: '#/$defs/node' } },
        },
        required: ['type'],
        additionalProperties: false,
      },
    },
  }
}

/** One line describing a node type: content expression and attributes with defaults. */
function describe(schema: Schema, name: string): string {
  const type = schema.nodes[name]
  if (!type) return ''
  const attrs = Object.entries(type.spec.attrs ?? {}).map(([key, spec]) =>
    spec && typeof spec === 'object' && 'default' in spec
      ? `${key} (default ${JSON.stringify(spec.default)})`
      : key,
  )
  const content = type.spec.content ? `content: ${type.spec.content}` : 'no content'
  return `- ${name}: ${content}${attrs.length ? `; attrs: ${attrs.join(', ')}` : ''}`
}

/** The node types a block may contain (its content, recursively), for the instructions. */
function reachable(schema: Schema, roots: readonly string[]): string[] {
  const seen = new Set<string>()
  const visit = (name: string) => {
    const type = schema.nodes[name]
    if (!type || seen.has(name)) return
    seen.add(name)
    for (const word of (type.spec.content ?? '').match(/[a-z_]+/gi) ?? []) {
      for (const t of Object.values(schema.nodes))
        if (t.name === word || (t.spec.group ?? '').split(' ').includes(word))
          if (!t.isLeaf || ALWAYS.has(t.name) || roots.includes(t.name)) visit(t.name)
    }
  }
  roots.forEach(visit)
  return [...seen]
}

/**
 * Instructions for the model (put them in your backend's system prompt for
 * requests with `output: "blocks"`): the answer format and the node types,
 * from the schema. The editor checks the answer anyway.
 */
export function aiBlocksPrompt(schema: Schema, blocks: AiBlocks): string {
  const marks = (blocks.marks ?? DEFAULT_AI_MARKS).filter((m) => schema.marks[m])
  const types = reachable(schema, blocks.nodes)
  return [
    'Answer ONLY with JSON lines (NDJSON): one block per line, no other text, no code fences.',
    'Each line is a node: {"type": "...", "attrs": {...}, "content": [...]}; text is {"type": "text", "text": "...", "marks": [{"type": "bold"}]}.',
    `Top-level block types: ${blocks.nodes.join(', ')}.`,
    'Node types:',
    ...types.map((n) => describe(schema, n)).filter(Boolean),
    `Marks: ${marks.join(', ') || 'none'}. No images, links or HTML unless listed above.`,
    'Example: {"type":"paragraph","content":[{"type":"text","text":"Hello"}]}',
  ].join('\n')
}
