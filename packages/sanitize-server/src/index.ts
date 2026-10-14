import {
  HTMLParser,
  serializeHTML,
  type HTMLParseOptions,
  type Node,
  type Schema,
} from '@scriba/core'
import { parseFragment } from 'parse5'
import { adaptParse5 } from './adapter.js'

export { adaptParse5 } from './adapter.js'

export interface SanitizeOptions extends HTMLParseOptions {
  /** Maximum input length in characters. Default 5 000 000. */
  maxInputLength?: number
}

/** Thrown when the input is larger than `maxInputLength`. */
export class InputTooLargeError extends RangeError {
  override name = 'InputTooLargeError'
}

/**
 * Parses untrusted HTML on the server into a document of `schema`, applying the
 * same rules as the editor. Anything the schema does not know is dropped.
 */
export function parseHTMLOnServer(
  schema: Schema,
  html: string,
  options: SanitizeOptions = {},
): Node {
  if (typeof html !== 'string') throw new TypeError('HTML input must be a string')
  if (html.length > (options.maxInputLength ?? 5_000_000))
    throw new InputTooLargeError('HTML input too large')
  // Same parsing mode as the editor's inert DOMParser document (scripting disabled),
  // so <noscript> content is read identically on both sides (mutation XSS guard).
  const fragment = parseFragment(html, { scriptingEnabled: false })
  return new HTMLParser(schema, options).parse(adaptParse5(fragment))
}

/**
 * Sanitizes untrusted HTML: parse with the schema, then serialize.
 * Run every HTML coming from clients through this before storing or showing it
 * (the editor's own sanitization can be bypassed by calling your API directly).
 */
export function sanitizeHTML(schema: Schema, html: string, options?: SanitizeOptions): string {
  return serializeHTML(parseHTMLOnServer(schema, html, options))
}
