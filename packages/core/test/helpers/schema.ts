import { Schema, basicSchemaSpec, type Node, type Mark, type HTMLSpec } from '../../src/index.js'

const { nodes: basicNodes, marks: basicMarks } = basicSchemaSpec

/** Small schema used across tests: the basic schema plus quotes, code, tables, images, links. */
export const schema = new Schema({
  nodes: {
    doc: basicNodes.doc,
    paragraph: basicNodes.paragraph,
    heading: basicNodes.heading,
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseHTML: [{ tag: 'blockquote' }],
      toHTML: (): HTMLSpec => ['blockquote', 0],
    },
    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      parseHTML: [{ tag: 'pre' }],
      toHTML: (): HTMLSpec => ['pre', ['code', 0]],
    },
    table: { content: 'table_row+', group: 'block', isolating: true },
    table_row: { content: 'table_cell+' },
    table_cell: { content: 'block+', isolating: true },
    text: basicNodes.text,
    image: {
      inline: true,
      group: 'inline',
      attrs: { src: { url: { kind: 'image' } }, alt: { default: '' } },
      parseHTML: [
        {
          tag: 'img',
          getAttrs: (el) => ({ src: el.getAttribute('src'), alt: el.getAttribute('alt') ?? '' }),
        },
      ],
      toHTML: (node): HTMLSpec => [
        'img',
        { src: node.attrs['src'] as string, alt: node.attrs['alt'] as string },
      ],
    },
    hard_break: basicNodes.hard_break,
  },
  marks: {
    link: {
      attrs: {
        href: { url: { kind: 'link' } },
        target: { default: null, validate: (v) => v === null || v === '_blank' },
      },
      inclusive: false,
      parseHTML: [
        {
          tag: 'a',
          getAttrs: (el) => ({
            href: el.getAttribute('href'),
            target: el.getAttribute('target') === '_blank' ? '_blank' : null,
          }),
        },
      ],
      toHTML: (mark): HTMLSpec => {
        const target = mark.attrs['target'] as string | null
        // CLAUDE.md §5.3: target=_blank always gets rel=noopener noreferrer
        return [
          'a',
          {
            href: mark.attrs['href'] as string,
            target,
            rel: target ? 'noopener noreferrer' : null,
          },
          0,
        ]
      },
    },
    bold: basicMarks.bold,
    italic: basicMarks.italic,
    code: basicMarks.code,
  },
})

type Child = Node | string

function children(items: Child[], marks: readonly Mark[] = []): Node[] {
  return items.map((c) => (typeof c === 'string' ? schema.text(c, marks) : c))
}

export const doc = (...c: Child[]) => schema.node('doc', null, children(c))
export const p = (...c: Child[]) => schema.node('paragraph', null, children(c))
export const h = (level: number, ...c: Child[]) => schema.node('heading', { level }, children(c))
export const quote = (...c: Child[]) => schema.node('blockquote', null, children(c))
export const pre = (...c: Child[]) => schema.node('code_block', null, children(c))
export const br = () => schema.node('hard_break')
export const img = (src: string) => schema.node('image', { src })
export const b = (text: string) => schema.text(text, [schema.mark('bold')])
export const i = (text: string) => schema.text(text, [schema.mark('italic')])
export const bi = (text: string) => schema.text(text, [schema.mark('bold'), schema.mark('italic')])
