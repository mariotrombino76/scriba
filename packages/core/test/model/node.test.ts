import { describe, expect, it } from 'vitest'
import { Fragment, Mark, Schema, basicSchemaSpec } from '../../src/index.js'
import { b, bi, br, doc, h, i, img, p, quote, schema } from '../helpers/schema.js'

describe('Node sizes and positions', () => {
  // doc( p("ab") ) → 0 <p> 1 a 2 b 3 </p> 4
  const d = doc(p('ab'), p('cd'))

  it('computes nodeSize', () => {
    expect(d.firstChild!.nodeSize).toBe(4)
    expect(d.content.size).toBe(8)
    expect(img('x.png').nodeSize).toBe(1)
  })

  it('finds nodes by position', () => {
    expect(d.nodeAt(0)!.type.name).toBe('paragraph')
    expect(d.nodeAt(1)!.text).toBe('ab')
    expect(d.nodeAt(4)!.textContent).toBe('cd')
    expect(d.nodeAt(8)).toBeNull()
  })

  it('extracts text', () => {
    expect(d.textBetween(0, d.content.size, '\n')).toBe('ab\ncd')
    expect(d.textBetween(2, 6, '|')).toBe('b|c')
    expect(doc(p('a', br(), 'b')).textContent).toBe('a\nb')
  })

  it('atomic blocks are separated like other blocks', () => {
    const atomic = new Schema({
      nodes: {
        ...basicSchemaSpec.nodes,
        task: { group: 'block', atom: true, leafText: () => '[ ] x', toHTML: () => ['div'] },
      },
      marks: basicSchemaSpec.marks,
    })
    const d2 = atomic.node('doc', null, [
      atomic.node('paragraph', null, [atomic.text('a')]),
      atomic.nodes['task']!.create(),
      atomic.node('paragraph', null, [atomic.text('b')]),
    ])
    expect(d2.textBetween(0, d2.content.size, '\n')).toBe('a\n[ ] x\nb')
  })

  it('walks nodesBetween with positions', () => {
    const seen: string[] = []
    d.nodesBetween(5, 7, (n, pos) => void seen.push(`${n.type.name}@${pos}`))
    expect(seen).toEqual(['paragraph@4', 'text@5'])
  })

  it('checks marks presence in range', () => {
    const md = doc(p('a', b('b'), 'c'))
    expect(md.rangeHasMark(2, 3, schema.marks.bold)).toBe(true)
    expect(md.rangeHasMark(1, 2, schema.marks.bold)).toBe(false)
  })
})

describe('Fragment', () => {
  it('merges adjacent text with same marks', () => {
    const f = Fragment.fromArray([schema.text('a'), schema.text('b'), b('c'), b('d')])
    expect(f.childCount).toBe(2)
    expect(f.child(0).text).toBe('ab')
    expect(f.child(1).text).toBe('cd')
  })

  it('cuts across nodes', () => {
    const f = doc(p('abc'), p('def')).content
    // 0 <p> 1 a 2 b 3 c 4 </p> 5 <p> 6 d 7 e 8 f 9 </p> 10
    const cut = f.cut(2, 8)
    expect(cut.toString()).toBe('paragraph("bc"), paragraph("de")')
  })

  it('findIndex resolves boundaries to the following child', () => {
    const f = doc(p('ab'), p('cd')).content
    expect(f.findIndex(0)).toEqual({ index: 0, offset: 0 })
    expect(f.findIndex(3)).toEqual({ index: 0, offset: 0 })
    expect(f.findIndex(4)).toEqual({ index: 1, offset: 4 })
    expect(f.findIndex(8)).toEqual({ index: 2, offset: 8 })
  })
})

describe('Marks', () => {
  it('keeps sets sorted by rank', () => {
    const set = Mark.setFrom([schema.mark('italic'), schema.mark('bold')])
    expect(set.map((m) => m.type.name)).toEqual(['bold', 'italic'])
  })

  it('replaces marks of the same type', () => {
    const a = schema.mark('link', { href: 'a' })
    const c = schema.mark('link', { href: 'c' })
    expect(c.addToSet([a])).toEqual([c])
  })

  it('applies excludes', () => {
    const set = schema.mark('code').addToSet([schema.mark('bold')])
    expect(set.map((m) => m.type.name)).toEqual(['code'])
    expect(schema.mark('bold').addToSet(set)).toBe(set)
  })

  it('compares sets', () => {
    expect(Mark.sameSet(bi('x').marks, bi('y').marks)).toBe(true)
    expect(Mark.sameSet(b('x').marks, i('y').marks)).toBe(false)
  })
})

describe('Schema', () => {
  it('validates content', () => {
    expect(() => doc().check()).toThrow()
    expect(() => doc(p('a')).check()).not.toThrow()
    expect(() => schema.nodes.doc.createChecked(null, [schema.text('x')])).toThrow()
  })

  it('fills required content', () => {
    const table = schema.nodes.table.createAndFill()!
    expect(table.toString()).toBe('table(table_row(table_cell(paragraph)))')
  })

  it('applies attribute defaults and validation', () => {
    expect(h(2, 'x').attrs).toEqual({ level: 2 })
    expect(schema.node('heading').attrs).toEqual({ level: 1 })
    expect(() => schema.node('heading', { level: 9 })).toThrow()
    expect(() => schema.node('image')).toThrow(/src/)
  })

  it('forbids marks in code blocks', () => {
    expect(schema.nodes.code_block.validContent(Fragment.from(b('x')))).toBe(false)
    expect(schema.nodes.code_block.validContent(Fragment.from(schema.text('x')))).toBe(true)
  })

  it('rejects bad content expressions', () => {
    expect(
      () =>
        new (schema.constructor as typeof import('../../src/index.js').Schema)({
          nodes: { doc: { content: 'nope+' }, text: {} },
        }),
    ).toThrow(/nope/)
  })
})

describe('JSON', () => {
  it('round-trips', () => {
    const d = doc(h(1, 'T'), quote(p('a', bi('b'), img('x.png'))))
    const back = schema.nodeFromJSON(JSON.parse(JSON.stringify(d.toJSON())))
    expect(back.eq(d)).toBe(true)
  })
})
