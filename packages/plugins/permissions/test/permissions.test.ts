// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  EditorState,
  Schema,
  TextSelection,
  TransformError,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  splitBlock,
  type MarkSpec,
  type Transaction,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import { blockquoteNodes, toggleBlockquote } from '@scriba-editor/plugin-blockquote'
import {
  blockPermissions,
  checkBlockEdits,
  transactionAllowed,
  withBlockIds,
  type BlockRules,
} from '../src/index.js'

const commentMarks = {
  comment: {
    attrs: { id: { validate: (v: unknown) => typeof v === 'string' } },
    excludes: '',
    serialize: false,
    toHTML: () => ['span', 0],
  },
} satisfies Record<string, MarkSpec>

const schema = new Schema({
  nodes: withBlockIds({ ...basicSchemaSpec.nodes, ...blockquoteNodes }),
  marks: { ...basicSchemaSpec.marks, ...commentMarks },
})
const t = createTranslator('it')
const rules: BlockRules = { canEdit: (id) => !id.startsWith('lock') }
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html').body
const parse = (html: string) => parseHTML(schema, dom(html))
const HTML =
  '<p data-block-id="free-1">libero</p><p data-block-id="lock-1">fisso</p><p>senza id</p>'
// positions: <p>libero</p> 0–8, <p>fisso</p> 8–15 (text 9–14), <p>senza id</p> 15–25
const state = () => EditorState.create({ schema, doc: parse(HTML) })
const allowed = (tr: Transaction) => transactionAllowed(tr, rules)

describe('block ids', () => {
  it('round trip through HTML; invalid ids are dropped', () => {
    expect(serializeHTML(parse(HTML))).toBe(HTML)
    expect(
      serializeHTML(parse('<p data-block-id="a b">x</p><h2 data-block-id="&quot;>">y</h2>')),
    ).toBe('<p>x</p><h2>y</h2>')
  })
})

describe('transactionAllowed', () => {
  it('editable blocks and blocks without id: anything goes', () => {
    const s = state()
    expect(allowed(s.tr.insertText('!', 3))).toBe(true)
    expect(allowed(s.tr.delete(16, 20))).toBe(true)
    expect(allowed(s.tr.delete(0, 8))).toBe(true)
  })

  it('protected block: no typing, deleting, formatting or attribute change', () => {
    const s = state()
    expect(allowed(s.tr.insertText('!', 9))).toBe(false) // at its start
    expect(allowed(s.tr.insertText('!', 14))).toBe(false) // at its end
    expect(allowed(s.tr.delete(10, 12))).toBe(false)
    expect(allowed(s.tr.delete(8, 15))).toBe(false) // the whole block
    expect(allowed(s.tr.delete(5, 20))).toBe(false) // a selection across it
    expect(allowed(s.tr.addMark(9, 14, schema.marks['bold']!.create()))).toBe(false)
    expect(allowed(s.tr.setNodeAttrs(8, { blockId: null }))).toBe(false)
    expect(allowed(s.tr.setNodeAttrs(8, { blockId: 'free-2' }))).toBe(false)
  })

  it('around a protected block, and comments on it, are fine', () => {
    const s = state()
    const p = schema.nodes['paragraph']!.create(null, schema.text('nuovo'))
    expect(allowed(s.tr.insert(8, p))).toBe(true) // before
    expect(allowed(s.tr.insert(15, p))).toBe(true) // after
    expect(allowed(s.tr.addMark(9, 14, schema.marks['comment']!.create({ id: 'c1' })))).toBe(true)
  })

  it('no new block may carry a protected id (paste, duplicate)', () => {
    const s = state()
    const copy = schema.nodes['paragraph']!.create({ blockId: 'lock-1' }, schema.text('fisso'))
    expect(allowed(s.tr.insert(0, copy))).toBe(false)
    expect(allowed(s.tr.setNodeAttrs(0, { blockId: 'lock-9' }))).toBe(false)
  })

  it('Enter at the edge of a protected block is refused, around it is fine', () => {
    const s = state()
    const at = (pos: number) => s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)))
    let tr: Transaction | null = null
    splitBlock(at(9), (t) => (tr = t))
    expect(allowed(tr!)).toBe(false)
    splitBlock(at(16), (t) => (tr = t))
    expect(allowed(tr!)).toBe(true)
  })
})

describe('checkBlockEdits (server)', () => {
  const after = (html: string) => checkBlockEdits(parse(HTML), parse(html), rules)

  it('accepts changes elsewhere and moved-around blocks', () => {
    expect(
      after('<p data-block-id="free-1">cambiato</p><p data-block-id="lock-1">fisso</p>'),
    ).toEqual([])
    expect(after('<p>prima</p><p data-block-id="lock-1">fisso</p>')).toEqual([])
  })

  it('reports changed, deleted and new protected blocks', () => {
    expect(after('<p data-block-id="lock-1">fisso!</p>')).toEqual(['lock-1'])
    expect(after('<p data-block-id="lock-1"><strong>fisso</strong></p>')).toEqual(['lock-1'])
    expect(after('<p>niente</p>')).toEqual(['lock-1'])
    expect(after('<p data-block-id="lock-1">fisso</p><p data-block-id="lock-1">fisso</p>')).toEqual(
      ['lock-1'],
    )
    expect(after('<p data-block-id="lock-1">fisso</p><p data-block-id="lock-2">x</p>')).toEqual([
      'lock-2',
    ])
    expect(after('<p>fisso</p>')).toEqual(['lock-1'])
  })

  it('ignores allowed marks (comments)', () => {
    const before = parse(HTML)
    const tr = EditorState.create({ schema, doc: before }).tr.addMark(
      9,
      14,
      schema.marks['comment']!.create({ id: 'c1' }),
    )
    expect(checkBlockEdits(before, tr.doc, rules)).toEqual([])
  })

  it('agrees with the editor: whatever the editor allows, the server accepts', () => {
    const doc0 = parse(
      '<p data-block-id="free-1">uno due</p><blockquote data-block-id="lock-q"><p>citata</p></blockquote>' +
        '<p data-block-id="lock-1">fisso <em>qui</em></p><p>tre</p><blockquote><p data-block-id="lock-2">dentro</p></blockquote>',
    )
    const size = doc0.content.size
    const op = fc.oneof(
      fc.record({
        kind: fc.constant('insert' as const),
        pos: fc.nat(size),
        text: fc.constantFrom('x', 'yz'),
      }),
      fc.record({ kind: fc.constant('delete' as const), a: fc.nat(size), b: fc.nat(size) }),
      fc.record({ kind: fc.constant('bold' as const), a: fc.nat(size), b: fc.nat(size) }),
      fc.record({ kind: fc.constant('split' as const), pos: fc.nat(size) }),
      fc.record({ kind: fc.constant('quote' as const), a: fc.nat(size), b: fc.nat(size) }),
    )
    fc.assert(
      fc.property(fc.array(op, { maxLength: 6 }), (ops) => {
        let s = EditorState.create({ schema, doc: doc0 })
        for (const o of ops) {
          const max = s.doc.content.size
          let tr: Transaction | null = null
          try {
            if (o.kind === 'insert') {
              const $p = s.doc.resolve(Math.min(o.pos, max))
              if (!$p.parent.inlineContent) continue
              tr = s.tr.insertText(o.text, $p.pos)
            } else if (o.kind === 'delete') {
              tr = s.tr.delete(Math.min(o.a, o.b, max), Math.min(Math.max(o.a, o.b), max))
            } else if (o.kind === 'bold') {
              tr = s.tr.addMark(
                Math.min(o.a, o.b, max),
                Math.min(Math.max(o.a, o.b), max),
                schema.marks['bold']!.create(),
              )
            } else {
              const a = o.kind === 'split' ? o.pos : Math.min(o.a, o.b)
              const b = o.kind === 'split' ? o.pos : Math.max(o.a, o.b)
              const inText = (pos: number) => s.doc.resolve(Math.min(pos, max)).parent.inlineContent
              if (!inText(a) || !inText(b)) continue // a caret can only be in text
              const sel = s.apply(
                s.tr.setSelection(TextSelection.create(s.doc, Math.min(a, max), Math.min(b, max))),
              )
              const cmd = o.kind === 'split' ? splitBlock : toggleBlockquote(schema)
              cmd(sel, (x) => (tr = x))
            }
          } catch (e) {
            if (!(e instanceof RangeError || e instanceof TransformError)) throw e
            continue // positions that do not fit the structure
          }
          if (!tr || !(tr as Transaction).docChanged || !allowed(tr)) continue
          expect(checkBlockEdits(s.doc, (tr as Transaction).doc, rules)).toEqual([])
          s = s.apply(tr)
        }
      }),
      { numRuns: Number(process.env['FUZZ_RUNS'] ?? 400) },
    )
  }, 30_000)
})

describe('blockPermissions in the view', () => {
  function setup() {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const refused: Transaction[] = []
    const view = new EditorView(place, {
      state: EditorState.create({
        schema,
        doc: parse(HTML),
        plugins: blockPermissions({ ...rules, t, onRefused: (tr) => refused.push(tr) }),
      }),
    })
    return { view, refused, place }
  }

  it('marks protected blocks (the caret may still enter them)', () => {
    const { view } = setup()
    const [free, locked] = view.dom.querySelectorAll('p')
    expect(locked!.classList.contains('scriba-locked')).toBe(true)
    expect(free!.classList.contains('scriba-locked')).toBe(false)
    expect(locked!.hasAttribute('contenteditable')).toBe(false)
  })

  it('Enter in a block with an id: the id stays with the longer half, only once', () => {
    const { view } = setup()
    const split = (pos: number) => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
      splitBlock(view.state, (tr) => view.dispatch(tr))
    }
    split(3) // "li|bero"
    expect(serializeHTML(view.state.doc)).toMatch(/^<p>li<\/p><p data-block-id="free-1">bero<\/p>/)
    split(1) // at the very start
    expect(serializeHTML(view.state.doc).match(/free-1/g)).toHaveLength(1)
  })

  it('refuses edits with a message; remote changes pass', () => {
    const { view, refused, place } = setup()
    view.dispatch(view.state.tr.insertText('!', 10))
    expect(view.state.doc.child(1).textContent).toBe('fisso')
    expect(refused).toHaveLength(1)
    expect(place.querySelector('[role=status]')?.textContent).toBe(
      'Questo blocco è protetto: non puoi modificarlo',
    )
    view.dispatch(view.state.tr.insertText('!', 10).setMeta('collabRemote', true))
    expect(view.state.doc.child(1).textContent).toBe('f!isso')
  })

  it('pasted HTML loses its block ids', () => {
    const { view } = setup()
    const body = dom('<p data-block-id="lock-1">copiato</p>')
    for (const plugin of view.state.plugins) {
      const transform = plugin.props['transformPastedDOM'] as ((b: HTMLElement) => void) | undefined
      transform?.(body)
    }
    expect(body.querySelector('[data-block-id]')).toBeNull()
  })
})
