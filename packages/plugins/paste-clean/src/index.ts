import { Plugin } from '@scriba/core'
import type { TransformPastedDOM } from '@scriba/view'
import { cleanPastedDOM, type PasteCleanOptions } from './clean.js'

export { cleanPastedDOM, detectSource, type PasteCleanOptions, type PasteSource } from './clean.js'

/**
 * Cleans HTML pasted from Word, Google Docs and web pages before the schema
 * parser: real nested lists from Word's fake ones, no Office/Docs wrappers,
 * no default fonts and black, no spacer junk.
 */
export function pasteClean(options: PasteCleanOptions = {}): Plugin {
  const transformPastedDOM: TransformPastedDOM = (body) => {
    cleanPastedDOM(body, options)
  }
  return new Plugin({ props: { transformPastedDOM } })
}
