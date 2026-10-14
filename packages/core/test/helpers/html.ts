import { JSDOM } from 'jsdom'
import { parseHTML, serializeHTML, type DOMLike, type HTMLParseOptions } from '../../src/index.js'
import { schema } from './schema.js'

const { DOMParser } = new JSDOM('').window

/** Parses an HTML string in an inert document (as the browser integration must, §5.2). */
export function dom(html: string): DOMLike {
  return new DOMParser().parseFromString(html, 'text/html').body
}

export const fromHTML = (html: string, options?: HTMLParseOptions) =>
  parseHTML(schema, dom(html), options)

/** parse → serialize */
export const clean = (html: string) => serializeHTML(fromHTML(html))
