import { describe, expect, it } from 'vitest'
import {
  deleteChar,
  deleteSelection,
  insertNode,
  isMarkActive,
  joinBackward,
  joinForward,
  selectAll,
  setBlockType,
  splitBlock,
  toggleMark,
  newlineInCode,
  wrapIn,
  lift,
  toggleWrap,
  isInNode,
  liftEmptyOrFirstBlock,
  liftEmptyBlock,
  NodeSelection,
  deleteSelectedBlock,
} from '../../src/index.js'
import { b, br, doc, h, img, p, pre, quote, schema } from '../helpers/schema.js'
import { nodeStateAt, run, stateAt } from '../helpers/state.js'

const bold = schema.marks.bold

describe('deleteSelection', () => {
  it('deletes a range and does nothing on a cursor', () => {
    expect(run(stateAt(doc(p('abcd')), 2, 4), deleteSelection)!.doc.eq(doc(p('ad')))).toBe(true)
    expect(run(stateAt(doc(p('ab')), 2), deleteSelection)).toBeNull()
  })

  it('deletes a node selection', () => {
    const s = nodeStateAt(doc(p('a', img('x'), 'b')), 2)
    expect(run(s, deleteSelection)!.doc.eq(doc(p('ab')))).toBe(true)
  })

  it('select all + delete leaves an empty paragraph', () => {
    const s = run(stateAt(doc(h(1, 'T'), p('x')), 1), selectAll)!
    expect(run(s, deleteSelection)!.doc.eq(doc(p()))).toBe(true)
  })
})

describe('joinBackward / joinForward', () => {
  it('joins with the previous paragraph', () => {
    const r = run(stateAt(doc(p('ab'), p('cd')), 5), joinBackward)!
    expect(r.doc.eq(doc(p('abcd')))).toBe(true)
    expect(r.selection.head).toBe(3)
  })

  it('joins out of a quote into the previous paragraph', () => {
    const r = run(stateAt(doc(p('ab'), quote(p('cd'))), 6), joinBackward)!
    expect(r.doc.eq(doc(p('abcd')))).toBe(true)
  })

  it('turns a heading at the start of the doc into a paragraph', () => {
    expect(run(stateAt(doc(h(1, 'ab')), 1), joinBackward)!.doc.eq(doc(p('ab')))).toBe(true)
    expect(run(stateAt(doc(p('ab')), 1), joinBackward)).toBeNull()
  })

  it('only works at the block edge', () => {
    expect(run(stateAt(doc(p('ab'), p('cd')), 6), joinBackward)).toBeNull()
    expect(run(stateAt(doc(p('ab'), p('cd')), 2), joinForward)).toBeNull()
  })

  it('joins forward', () => {
    expect(run(stateAt(doc(p('ab'), p('cd')), 3), joinForward)!.doc.eq(doc(p('abcd')))).toBe(true)
    expect(run(stateAt(doc(p('ab')), 3), joinForward)).toBeNull()
  })

  describe('never merge across a table border (isolating cells)', () => {
    const cell = (...c: ReturnType<typeof p>[]) => schema.node('table_cell', null, c)
    const table = (...c: ReturnType<typeof p>[]) =>
      schema.node('table', null, [schema.node('table_row', null, [cell(...c)])])

    it('Backspace after a table leaves the paragraph outside', () => {
      const d = doc(table(p('ab')), p('cd'))
      const r = run(stateAt(d, 11), joinBackward)!
      expect(r.doc.eq(d)).toBe(true)
      // the table gets selected: a second Backspace deletes it
      expect(r.selection).toBeInstanceOf(NodeSelection)
      expect([r.selection.from, r.selection.to]).toEqual([0, 10])
      expect(run(r, deleteSelection)!.doc.eq(doc(p('cd')))).toBe(true)
    })

    it('Backspace in an empty paragraph after a table removes it, cursor in the last cell', () => {
      const r = run(stateAt(doc(table(p('ab')), p(), p('z')), 11), joinBackward)!
      expect(r.doc.eq(doc(table(p('ab')), p('z')))).toBe(true)
      expect(r.selection.head).toBe(6)
    })

    it('Delete before a table leaves the table alone', () => {
      const d = doc(p('ab'), table(p('cd')))
      const sel = run(stateAt(d, 3), joinForward)!
      expect(sel.doc.eq(d)).toBe(true)
      expect([sel.selection.from, sel.selection.to]).toEqual([4, 4 + d.child(1).nodeSize])
      const r = run(stateAt(doc(p(), table(p('cd'))), 1), joinForward)!
      expect(r.doc.eq(doc(table(p('cd'))))).toBe(true)
      expect(r.selection.head).toBe(4)
    })

    it('a selection from outside into a cell deletes text on each side, never joins', () => {
      // 0 <p>1 a b 3</p>4 <table>5 <row>6 <cell>7 <p>8 c d 10 ...
      const d = doc(p('ab'), table(p('cd')), p('ef'))
      const r = run(stateAt(d, 2, 9), deleteSelection)!
      expect(r.doc.eq(doc(p('a'), table(p('d')), p('ef')))).toBe(true)
      expect(r.selection.head).toBe(2)
      // both ends outside the table: a normal delete (the table goes, the text joins)
      const all = run(stateAt(d, 2, d.content.size - 2), deleteSelection)!
      expect(all.doc.eq(doc(p('af')))).toBe(true)
    })

    it('typing over such a selection keeps the table', () => {
      const d = doc(p('ab'), table(p('cd')), p('ef'))
      const s = stateAt(d, 2, 9)
      const r = s.apply(s.tr.insertText('X'))
      expect(r.doc.eq(doc(p('aX'), table(p('d')), p('ef')))).toBe(true)
    })

    it('Backspace on a selected table deletes it, cursor after; Delete leaves it before', () => {
      const d = doc(p('ab'), table(p('cd')), p('ef'))
      const sel = nodeStateAt(d, 4)
      const back = run(sel, deleteSelectedBlock(-1))!
      expect(back.doc.eq(doc(p('ab'), p('ef')))).toBe(true)
      expect(back.selection.head).toBe(5) // start of "ef"
      const fwd = run(sel, deleteSelectedBlock(1))!
      expect(fwd.selection.head).toBe(3) // end of "ab"
      expect(run(stateAt(d, 1), deleteSelectedBlock(-1))).toBeNull()
    })

    it('Backspace at the start of a cell does not pull it out of the table', () => {
      const d = doc(p('x'), table(p('ab')))
      expect(run(stateAt(d, 7), joinBackward)!.doc.eq(d)).toBe(true)
      const empty = doc(p('x'), table(p()))
      expect(run(stateAt(empty, 7), joinBackward)!.doc.eq(empty)).toBe(true)
    })
  })
})

describe('deleteChar', () => {
  it('deletes characters and whole graphemes', () => {
    expect(run(stateAt(doc(p('abc')), 3), deleteChar(-1))!.doc.eq(doc(p('ac')))).toBe(true)
    expect(run(stateAt(doc(p('abc')), 2), deleteChar(1))!.doc.eq(doc(p('ac')))).toBe(true)
    // family emoji = 8 UTF-16 units, one grapheme
    const family = '👨‍👩‍👧'
    const d = doc(p('a' + family + 'b'))
    expect(run(stateAt(d, 2 + family.length), deleteChar(-1))!.doc.eq(doc(p('ab')))).toBe(true)
    expect(run(stateAt(d, 2), deleteChar(1))!.doc.eq(doc(p('ab')))).toBe(true)
  })

  it('treats inline leaves as one character', () => {
    expect(run(stateAt(doc(p('a', br(), 'b')), 3), deleteChar(-1))!.doc.eq(doc(p('ab')))).toBe(true)
  })
})

describe('splitBlock', () => {
  it('splits a paragraph', () => {
    const r = run(stateAt(doc(p('abcd')), 3), splitBlock)!
    expect(r.doc.eq(doc(p('ab'), p('cd')))).toBe(true)
    expect(r.selection.head).toBe(5)
  })

  it('creates a paragraph after a heading when at its end', () => {
    expect(run(stateAt(doc(h(1, 'ab')), 3), splitBlock)!.doc.eq(doc(h(1, 'ab'), p()))).toBe(true)
    expect(run(stateAt(doc(h(1, 'ab')), 2), splitBlock)!.doc.eq(doc(h(1, 'a'), h(1, 'b')))).toBe(
      true,
    )
  })

  it('replaces the selection', () => {
    expect(run(stateAt(doc(p('abcd')), 2, 4), splitBlock)!.doc.eq(doc(p('a'), p('d')))).toBe(true)
  })

  it('inserts a newline in code blocks', () => {
    expect(run(stateAt(doc(pre('ab')), 2), newlineInCode)!.doc.eq(doc(pre('a\nb')))).toBe(true)
    expect(run(stateAt(doc(p('ab')), 2), newlineInCode)).toBeNull()
  })
})

describe('marks', () => {
  it('toggles a mark on a range', () => {
    const on = run(stateAt(doc(p('abcd')), 2, 4), toggleMark(bold))!
    expect(on.doc.eq(doc(p('a', b('bc'), 'd')))).toBe(true)
    expect(isMarkActive(on, bold)).toBe(true)
    const off = run(on, toggleMark(bold))!
    expect(off.doc.eq(doc(p('abcd')))).toBe(true)
  })

  it('adds the mark when the range is only partly marked', () => {
    const r = run(stateAt(doc(p('a', b('b'), 'c')), 1, 4), toggleMark(bold))!
    expect(r.doc.eq(doc(p(b('abc'))))).toBe(true)
  })

  it('toggles stored marks on a cursor', () => {
    const r = run(stateAt(doc(p('ab')), 2), toggleMark(bold))!
    expect(isMarkActive(r, bold)).toBe(true)
    const typed = r.apply(r.tr.insertText('X'))
    expect(typed.doc.eq(doc(p('a', b('X'), 'b')))).toBe(true)
  })

  it('is unavailable where the mark is not allowed', () => {
    expect(toggleMark(bold)(stateAt(doc(pre('ab')), 1, 3))).toBe(false)
  })
})

describe('block commands', () => {
  it('sets block type', () => {
    const r = run(
      stateAt(doc(p('ab'), p('cd')), 2, 6),
      setBlockType(schema.nodes.heading, { level: 2 }),
    )!
    expect(r.doc.eq(doc(h(2, 'ab'), h(2, 'cd')))).toBe(true)
    expect(setBlockType(schema.nodes.heading, { level: 2 })(r)).toBe(false)
  })

  it('inserts a hard break', () => {
    const r = run(stateAt(doc(p('ab')), 2), insertNode(schema.nodes.hard_break))!
    expect(r.doc.eq(doc(p('a', br(), 'b')))).toBe(true)
    expect(r.selection.head).toBe(3)
  })
})

describe('structure commands', () => {
  it('wraps in and lifts out of a blockquote', () => {
    const wrapped = run(stateAt(doc(p('a'), p('b')), 1, 4), wrapIn(schema.nodes.blockquote))!
    expect(wrapped.doc.eq(doc(quote(p('a'), p('b'))))).toBe(true)
    const lifted = run(wrapped, lift)!
    expect(lifted.doc.eq(doc(p('a'), p('b')))).toBe(true)
  })

  it('toggles a wrapper', () => {
    const bq = schema.nodes.blockquote
    const on = run(stateAt(doc(p('a')), 2), toggleWrap(bq))!
    expect(on.doc.eq(doc(quote(p('a'))))).toBe(true)
    expect(isInNode(on, bq)).toBe(true)
    const off = run(on, toggleWrap(bq))!
    expect(off.doc.eq(doc(p('a')))).toBe(true)
  })

  it('toggling a wrapper never throws, even from a position between blocks', () => {
    // found by fuzzing: wrap from between two blocks, then toggle at a block boundary
    const bq = schema.nodes.blockquote
    const once = run(stateAt(doc(p('uno due'), quote(p('citata'))), 9, 10), toggleWrap(bq))
    const start = once ?? stateAt(doc(p('uno due'), quote(p('citata'))), 9, 10)
    for (let pos = 0; pos <= start.doc.content.size; pos++)
      expect(() => run(stateAt(start.doc, pos), toggleWrap(bq)), `pos ${pos}`).not.toThrow()
  })

  it('Backspace at the start of the first quoted block lifts it out', () => {
    const r = run(stateAt(doc(p('x'), quote(p('a'), p('b'))), 5), liftEmptyOrFirstBlock)!
    expect(r.doc.eq(doc(p('x'), p('a'), quote(p('b'))))).toBe(true)
    expect(run(stateAt(doc(p('x'), quote(p('a'), p('b'))), 8), liftEmptyOrFirstBlock)).toBeNull()
    expect(run(stateAt(doc(p('a')), 1), liftEmptyOrFirstBlock)).toBeNull()
  })
})

describe('leaving a container with Enter', () => {
  it('lifts an empty last block out of the quote', () => {
    const r = run(stateAt(doc(quote(p('a'), p())), 5), liftEmptyBlock)!
    expect(r.doc.eq(doc(quote(p('a')), p()))).toBe(true)
  })

  it('splits the quote around an empty middle block', () => {
    const r = run(stateAt(doc(quote(p('a'), p(), p('b'))), 5), liftEmptyBlock)!
    expect(r.doc.eq(doc(quote(p('a')), p(), quote(p('b'))))).toBe(true)
  })

  it('does nothing for non-empty blocks or at the top level', () => {
    expect(run(stateAt(doc(quote(p('a'))), 3), liftEmptyBlock)).toBeNull()
    expect(run(stateAt(doc(p()), 1), liftEmptyBlock)).toBeNull()
  })
})
