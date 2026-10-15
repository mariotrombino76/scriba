import { describe, expect, it } from 'vitest'
import {
  ADD_TO_HISTORY,
  Plugin,
  history,
  redo,
  redoDepth,
  undo,
  undoDepth,
  type EditorState,
} from '../../src/index.js'
import { doc, p, schema } from '../helpers/schema.js'
import { run, stateAt } from '../helpers/state.js'

function type(state: EditorState, text: string, time: number): EditorState {
  const tr = state.tr.insertText(text)
  tr.time = time
  return state.apply(tr)
}

describe('history', () => {
  const start = () => stateAt(doc(p()), 1, 1, [history()])

  it('groups changes close in time into one undo step', () => {
    let s = start()
    s = type(s, 'a', 1000)
    s = type(s, 'b', 1100)
    s = type(s, 'c', 1200)
    expect(undoDepth(s)).toBe(1)
    const undone = run(s, undo)!
    expect(undone.doc.eq(doc(p()))).toBe(true)
    expect(undone.selection.head).toBe(1)
  })

  it('never groups formatting with typing', () => {
    let s = start()
    s = type(s, 'abc', 1000)
    const tr = s.tr.addMark(2, 4, schema.mark('bold'))
    tr.time = 1100
    s = s.apply(tr)
    expect(undoDepth(s)).toBe(2)
    expect(run(s, undo)!.doc.eq(doc(p('abc')))).toBe(true)
  })

  it('never groups block replacements (a rebuilt table, a loaded source) with typing', () => {
    let s = start()
    s = type(s, 'abc', 1000)
    const tr = s.tr.replaceWith(0, s.doc.content.size, doc(p('x'), p('y')).content)
    tr.time = 1100
    s = s.apply(tr)
    expect(undoDepth(s)).toBe(2)
    expect(run(s, undo)!.doc.eq(doc(p('abc')))).toBe(true)
    // inline insertions (typing, pasting words) still group
    s = type(s, 'z', 1200)
    s = type(s, 'w', 1300)
    expect(undoDepth(s)).toBe(3)
  })

  it("changes appended by a plugin belong to their root's undo step", () => {
    const shout = new Plugin({
      appendTransaction(trs, _old, state) {
        if (!trs.some((t) => t.docChanged) || !state.doc.textContent.endsWith('b')) return null
        return state.tr.insertText('!', state.doc.content.size - 1)
      },
    })
    let s = stateAt(doc(p('a')), 2, 2, [history(), shout])
    s = s.apply(s.tr.insertText('b'))
    expect(s.doc.eq(doc(p('ab!')))).toBe(true)
    expect(undoDepth(s)).toBe(1)
    expect(run(s, undo)!.doc.eq(doc(p('a')))).toBe(true)
  })

  it('splits groups after the delay', () => {
    let s = start()
    s = type(s, 'a', 1000)
    s = type(s, 'b', 3000)
    expect(undoDepth(s)).toBe(2)
    expect(run(s, undo)!.doc.eq(doc(p('a')))).toBe(true)
  })

  it('redoes and clears redo on new changes', () => {
    let s = start()
    s = type(s, 'ab', 1000)
    s = run(s, undo)!
    expect(redoDepth(s)).toBe(1)
    const redone = run(s, redo)!
    expect(redone.doc.eq(doc(p('ab')))).toBe(true)
    expect(redone.selection.head).toBe(3)
    expect(run(redone, redo)).toBeNull()
    const fresh = type(s, 'x', 5000)
    expect(redoDepth(fresh)).toBe(0)
  })

  it('undo/redo many times returns to the same documents', () => {
    let s = start()
    const docs = [s.doc]
    for (let i = 0; i < 5; i++) {
      s = type(s, String(i), 1000 * (i + 1) * 10)
      docs.push(s.doc)
    }
    for (let i = 4; i >= 0; i--) {
      s = run(s, undo)!
      expect(s.doc.eq(docs[i]!)).toBe(true)
    }
    expect(run(s, undo)).toBeNull()
    for (let i = 1; i <= 5; i++) {
      s = run(s, redo)!
      expect(s.doc.eq(docs[i]!)).toBe(true)
    }
  })

  it('keeps remote changes out of history and rebases over them', () => {
    let s = start()
    s = type(s, 'abc', 1000) // p("abc")
    // a collaborator inserts "XY" at the start
    const remote = s.tr.insert(1, schema.text('XY')).setMeta(ADD_TO_HISTORY, false)
    s = s.apply(remote)
    expect(s.doc.eq(doc(p('XYabc')))).toBe(true)
    const undone = run(s, undo)!
    expect(undone.doc.eq(doc(p('XY')))).toBe(true)
  })
})
