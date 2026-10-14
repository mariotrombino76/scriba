import type { Node } from '../model/node.js'
import type { Schema } from '../model/schema.js'
import { HTMLParser, type HTMLParseOptions } from './parser.js'
import { HTMLSerializer } from './serializer.js'
import type { DOMLike } from './types.js'

const parsers = new WeakMap<Schema, HTMLParser>()
const serializers = new WeakMap<Schema, HTMLSerializer>()

/** Parses an inert DOM tree into a document of `schema`. */
export function parseHTML(schema: Schema, root: DOMLike, options?: HTMLParseOptions): Node {
  if (options) return new HTMLParser(schema, options).parse(root)
  let parser = parsers.get(schema)
  if (!parser) parsers.set(schema, (parser = new HTMLParser(schema)))
  return parser.parse(root)
}

/** Serializes a document's content to an HTML string. */
export function serializeHTML(doc: Node): string {
  const schema = doc.type.schema
  let serializer = serializers.get(schema)
  if (!serializer) serializers.set(schema, (serializer = new HTMLSerializer(schema)))
  return serializer.serializeFragment(doc.content)
}
