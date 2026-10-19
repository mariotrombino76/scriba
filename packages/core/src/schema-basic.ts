import { isBoldWeight, styleValue } from './html/style.js'
import type { DOMLikeElement, HTMLSpec, ParseRule } from './html/types.js'
import type { AttrSpec } from './model/attrs.js'
import type { Node } from './model/node.js'
import { Schema, type SchemaSpec } from './model/schema.js'

const hole = (tag: string) => (): HTMLSpec => [tag, 0]

/** Matches `<span style="prop: …">` when `test` accepts the value. */
const spanStyle = (prop: string, test: (v: string | null) => boolean): ParseRule => ({
  tag: 'span',
  getAttrs: (el: DOMLikeElement) => (test(styleValue(el, prop)) ? null : false),
})

const headingLevel: AttrSpec = {
  default: 1,
  validate: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6,
}

/**
 * Phase 1 schema: paragraphs, headings h1–h6, hard breaks and the basic marks.
 * Use it as is, or spread its specs into a bigger schema.
 */
export const basicSchemaSpec = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseHTML: [{ tag: 'p' }],
      toHTML: hole('p'),
    },
    heading: {
      content: 'inline*',
      group: 'block',
      defining: true,
      attrs: { level: headingLevel },
      parseHTML: [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        getAttrs: () => ({ level }),
      })),
      toHTML: (node: Node): HTMLSpec => [`h${node.attrs['level'] as number}`, 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      leafText: () => '\n',
      parseHTML: [{ tag: 'br' }],
      toHTML: (): HTMLSpec => ['br'],
    },
  },
  marks: {
    bold: {
      parseHTML: [
        { tag: 'strong' },
        // Google Docs wraps everything in <b style="font-weight:normal">
        {
          tag: 'b',
          getAttrs: (el: DOMLikeElement) =>
            styleValue(el, 'font-weight') === 'normal' ? false : null,
        },
        spanStyle('font-weight', isBoldWeight),
      ],
      toHTML: hole('strong'),
    },
    italic: {
      parseHTML: [{ tag: 'em' }, { tag: 'i' }, spanStyle('font-style', (v) => v === 'italic')],
      toHTML: hole('em'),
    },
    underline: {
      parseHTML: [{ tag: 'u' }, spanStyle('text-decoration', (v) => !!v?.includes('underline'))],
      toHTML: hole('u'),
    },
    strike: {
      parseHTML: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        spanStyle('text-decoration', (v) => !!v?.includes('line-through')),
      ],
      toHTML: hole('s'),
    },
    superscript: {
      excludes: 'subscript',
      parseHTML: [{ tag: 'sup' }, spanStyle('vertical-align', (v) => v === 'super')],
      toHTML: hole('sup'),
    },
    subscript: {
      excludes: 'superscript',
      parseHTML: [{ tag: 'sub' }, spanStyle('vertical-align', (v) => v === 'sub')],
      toHTML: hole('sub'),
    },
    code: { excludes: '_', parseHTML: [{ tag: 'code' }], toHTML: hole('code') },
  },
} satisfies SchemaSpec

export const basicSchema = new Schema({
  nodes: { ...basicSchemaSpec.nodes },
  marks: { ...basicSchemaSpec.marks },
})
