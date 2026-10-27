import type { DOMLike } from '@scriba/core'
import type { DefaultTreeAdapterMap } from 'parse5'

type P5Node = DefaultTreeAdapterMap['node']
type P5Element = DefaultTreeAdapterMap['element']

const HTML_NS = 'http://www.w3.org/1999/xhtml'
/**
 * MathML elements are elements too, as in the browser's DOM: the core parser
 * drops a <math> subtree unless the schema reads a formula from it (only its
 * LaTeX annotation, never its markup). SVG stays hidden (always dropped).
 */
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

/**
 * Exposes a parse5 node through the `DOMLike` interface read by the core parser.
 * Children are wrapped lazily, so the core parser's depth limit applies before
 * any deep recursion happens here.
 */
class Parse5Node implements DOMLike {
  readonly nodeType: number
  readonly nodeName: string
  readonly nodeValue: string | null
  private children: DOMLike[] | null = null

  constructor(private readonly node: P5Node) {
    const name = node.nodeName
    if (name === '#text') {
      this.nodeType = 3
      this.nodeValue = (node as DefaultTreeAdapterMap['textNode']).value
    } else if (name === '#document' || name === '#document-fragment') {
      this.nodeType = name === '#document' ? 9 : 11
      this.nodeValue = null
    } else if (
      'tagName' in node &&
      ((node as P5Element).namespaceURI === HTML_NS ||
        (node as P5Element).namespaceURI === MATHML_NS)
    ) {
      this.nodeType = 1
      this.nodeValue = null
    } else {
      // comments, doctypes and SVG content are ignored
      this.nodeType = 8
      this.nodeValue = null
    }
    this.nodeName = name
  }

  get childNodes(): ArrayLike<DOMLike> {
    if (!this.children) {
      const kids = this.nodeType === 8 || !('childNodes' in this.node) ? [] : this.node.childNodes
      this.children = kids.map((child) => new Parse5Node(child))
    }
    return this.children
  }

  getAttribute(name: string): string | null {
    if (this.nodeType !== 1) return null
    const attr = (this.node as P5Element).attrs.find(
      (a) => a.name === name && !a.prefix && !a.namespace,
    )
    return attr ? attr.value : null
  }
}

export function adaptParse5(node: P5Node): DOMLike {
  return new Parse5Node(node)
}
