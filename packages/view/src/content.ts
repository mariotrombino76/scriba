import { parseHTML, serializeHTML, type Node, type NodeJSON, type Schema } from '@scriba/core'
import { parseInertHTML } from './trusted-types.js'

export type ContentFormat = 'html' | 'json'
export type Content = string | NodeJSON

/**
 * Builds a document from editor content (HTML or JSON). HTML always goes through the schema
 * parser on an inert document (CLAUDE.md §5.2); JSON is validated by the schema.
 */
export function parseContent(
  schema: Schema,
  value: Content | null | undefined,
  format: ContentFormat,
): Node {
  if (value === null || value === undefined || value === '') {
    return schema.topNodeType.createAndFill()!
  }
  if (format === 'json') {
    const json = typeof value === 'string' ? (JSON.parse(value) as NodeJSON) : value
    return schema.nodeFromJSON(json)
  }
  if (typeof value !== 'string') throw new TypeError('HTML content must be a string')
  return parseHTML(schema, parseInertHTML(value).body)
}

export function serializeContent(doc: Node, format: ContentFormat): Content {
  return format === 'json' ? doc.toJSON() : serializeHTML(doc)
}

/** Structural equality of two contents (wrappers use it to avoid feedback loops). */
export function sameContent(a: Content | null | undefined, b: Content | null | undefined): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object' && a && b)
    return JSON.stringify(a) === JSON.stringify(b)
  return false
}
