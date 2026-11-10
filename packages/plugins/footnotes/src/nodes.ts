import type { DOMLike, DOMLikeElement, NodeSpec } from '@scriba-editor/core'

/**
 * Footnotes (approved 2026-10-26). A reference in the text and its note in
 * the list at the end of the document, linked by number:
 *
 *   text<sup><a href="#fn-1" id="fnref-1">1</a></sup> …
 *   <ol class="scriba-footnotes"><li id="fn-1"><p>The note.</p></li></ol>
 *
 * Ids only as `fn-<number>` / `fnref-<number>` (fixed prefixes, no clobbering
 * of page globals). Numbers and the list are kept in order by `footnotes()`;
 * the `key` linking a reference to its note stays in the editor (not in HTML).
 */
export const FOOTNOTES_CLASS = 'scriba-footnotes'
export const MAX_FOOTNOTES = 9999

const isNumber = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_FOOTNOTES
const isKey = (v: unknown) => typeof v === 'string' && /^[a-z0-9]{0,24}$/.test(v)

/** The number in `prefix<n>` (1–9999, no leading zeros), or null. */
function numberIn(value: string | null, prefix: string): number | null {
  const m = value && new RegExp(`^${prefix}([1-9]\\d{0,3})$`).exec(value)
  return m ? Number(m[1]) : null
}

/** The reference's `<a href="#fn-N" id="fnref-N">` inside a `<sup>`, as N. */
function referenceNumber(sup: DOMLikeElement): number | null {
  const children = sup.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as DOMLike & Partial<DOMLikeElement>
    if (child.nodeType !== 1 || child.nodeName.toLowerCase() !== 'a' || !child.getAttribute)
      continue
    const n = numberIn(child.getAttribute('href'), '#fn-')
    return n !== null && n === numberIn(child.getAttribute('id'), 'fnref-') ? n : null
  }
  return null
}

export const footnoteNodes = {
  footnote_ref: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      n: { default: 1, validate: isNumber },
      key: { default: '', validate: isKey },
    },
    leafText: (node) => `[${node.attrs['n'] as number}]`,
    parseHTML: [
      {
        tag: 'sup',
        // before the superscript mark: this <sup> is the reference, not formatting
        priority: 60,
        getAttrs: (el) => {
          const n = referenceNumber(el)
          return n === null ? false : { n, key: `n${n}` }
        },
      },
    ],
    toHTML: (node) => {
      const n = node.attrs['n'] as number
      return ['sup', ['a', { href: `#fn-${n}`, id: `fnref-${n}` }, String(n)]]
    },
  },
  footnotes: {
    group: 'block',
    content: 'footnote+',
    isolating: true,
    parseHTML: [
      {
        tag: 'ol',
        priority: 60,
        getAttrs: (el) =>
          (el.getAttribute('class') ?? '').split(/\s+/).includes(FOOTNOTES_CLASS) ? null : false,
      },
    ],
    toHTML: () => ['ol', { class: FOOTNOTES_CLASS }, 0],
  },
  footnote: {
    content: 'paragraph+',
    isolating: true,
    defining: true,
    attrs: {
      n: { default: 1, validate: isNumber },
      key: { default: '', validate: isKey },
    },
    parseHTML: [
      {
        tag: 'li',
        priority: 60,
        getAttrs: (el) => {
          const n = numberIn(el.getAttribute('id'), 'fn-')
          return n === null ? false : { n, key: `n${n}` }
        },
      },
    ],
    toHTML: (node) => ['li', { id: `fn-${node.attrs['n'] as number}` }, 0],
  },
} satisfies Record<string, NodeSpec>
