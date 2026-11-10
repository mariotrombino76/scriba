import type { DOMLike, DOMLikeElement, HTMLSpec, NodeSpec } from '@scriba-editor/core'

/** Language ids like `javascript`, `c++`, `c#`, `objective-c`. */
export const LANGUAGE = /^[a-z0-9][a-z0-9+#_-]{0,31}$/

function languageFromClass(value: string | null): string | null {
  const m = value && /(?:^|\s)(?:language|lang)-([A-Za-z0-9+#_-]{1,32})(?:\s|$)/.exec(value)
  const lang = m ? m[1]!.toLowerCase() : null
  return lang && LANGUAGE.test(lang) ? lang : null
}

function readLanguage(el: DOMLikeElement): string | null {
  const own = el.getAttribute('data-language')?.toLowerCase() ?? null
  if (own && LANGUAGE.test(own)) return own
  const fromPre = languageFromClass(el.getAttribute('class'))
  if (fromPre) return fromPre
  // <pre><code class="language-js">
  const kids = el.childNodes
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i] as DOMLike
    if (child.nodeType === 1 && child.nodeName.toLowerCase() === 'code' && child.getAttribute) {
      return languageFromClass(child.getAttribute('class'))
    }
  }
  return null
}

/** The code block node: plain text, no marks, optional language. */
export const codeBlockNodes = {
  code_block: {
    content: 'text*',
    group: 'block',
    code: true,
    defining: true,
    marks: '',
    attrs: {
      language: {
        default: null,
        validate: (v) => v === null || (typeof v === 'string' && LANGUAGE.test(v)),
      },
    },
    parseHTML: [{ tag: 'pre', getAttrs: (el) => ({ language: readLanguage(el) }) }],
    toHTML: (node): HTMLSpec => {
      const lang = node.attrs['language'] as string | null
      // `class` only from the validated language attribute (§5.4).
      return ['pre', ['code', { class: lang ? `language-${lang}` : null }, 0]]
    },
  },
} satisfies Record<string, NodeSpec>
