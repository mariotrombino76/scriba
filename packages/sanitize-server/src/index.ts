import {
  HTMLParser,
  serializeHTML,
  type HTMLParseOptions,
  type Node,
  type Schema,
} from '@scriba/core'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
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
  // Parsed exactly like the editor does: a whole document with scripting disabled (an inert
  // DOMParser document), then its <body>. A fragment parse would differ, e.g. a leading
  // <noscript> goes into <head> in a document and its other content back to <body>
  // (mutation XSS guard: server and browser must read the same tree).
  const document = parse(html, { scriptingEnabled: false })
  return new HTMLParser(schema, options).parse(adaptParse5(bodyOf(document)))
}

type P5Parent = DefaultTreeAdapterMap['document'] | DefaultTreeAdapterMap['element']

/** `document.body`: the <body> (or <frameset>) of the <html> element. */
function bodyOf(document: DefaultTreeAdapterMap['document']): P5Parent {
  const html = document.childNodes.find((n) => n.nodeName === 'html') as P5Parent | undefined
  const body = html?.childNodes.find((n) => n.nodeName === 'body' || n.nodeName === 'frameset')
  return (body as P5Parent | undefined) ?? document
}

/**
 * Sanitizes untrusted HTML: parse with the schema, then serialize.
 * Run every HTML coming from clients through this before storing or showing it
 * (the editor's own sanitization can be bypassed by calling your API directly).
 */
export function sanitizeHTML(schema: Schema, html: string, options?: SanitizeOptions): string {
  return serializeHTML(parseHTMLOnServer(schema, html, options))
}
