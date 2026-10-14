import { expect } from 'vitest'
import { dom } from './html.js'

/** Output allow-list for the test schema: tag → allowed attributes. */
const ALLOWED: Record<string, readonly string[]> = {
  p: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], br: [], strong: [], em: [], code: [],
  pre: [], blockquote: [], img: ['src', 'alt'], a: ['href', 'target', 'rel'],
} // prettier-ignore

const SAFE_URL = /^(https?:|mailto:|tel:|data:image\/(png|jpeg|gif|webp);base64,|[^:]*$)/i

interface El {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<El>
  attributes?: ArrayLike<{ name: string; value: string }>
}

/**
 * Structural safety oracle: re-parses the output like a browser would and checks
 * every element and attribute. Text that merely *looks* like code is fine.
 */
export function expectSafe(html: string): void {
  const walk = (node: El): void => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]!
      expect(child.nodeType, `node type in ${html}`).not.toBe(8) // comments
      if (child.nodeType !== 1) continue
      const tag = child.nodeName.toLowerCase()
      expect(Object.keys(ALLOWED), `tag <${tag}> in ${html}`).toContain(tag)
      for (let j = 0; j < (child.attributes?.length ?? 0); j++) {
        const { name, value } = child.attributes![j]!
        expect(ALLOWED[tag], `attribute ${name} on <${tag}> in ${html}`).toContain(name)
        if (name === 'href' || name === 'src') {
          const compact = [...value].filter((c) => c.charCodeAt(0) > 0x20).join('')
          expect(compact, `URL in ${html}`).toMatch(SAFE_URL)
        }
      }
      walk(child)
    }
  }
  walk(dom(html) as unknown as El)
}
