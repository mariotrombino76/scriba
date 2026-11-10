// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  AllSelection,
  EditorState,
  TextSelection,
  basicSchema,
  history,
  parseHTML,
  undo,
  serializeHTML,
} from '@scriba-editor/core'
import { caseMenu, changeCase, type LetterCase } from '../src/index.js'

const parse = (html: string) =>
  parseHTML(basicSchema, new DOMParser().parseFromString(html, 'text/html').body)

function run(kind: LetterCase, html: string, from: number, to: number, locale?: string) {
  const doc = parse(html)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })
  const ok = changeCase(kind, locale)(state, (tr) => (state = state.apply(tr)))
  return { ok, html: serializeHTML(state.doc), sel: [state.selection.from, state.selection.to] }
}

describe('changeCase', () => {
  const P = '<p>il gatto <strong>NERO dorme</strong>. poi si sveglia</p>'
  const all = [1, 37] as const

  it('lowercase and UPPERCASE keep the formatting and the selection', () => {
    expect(run('lower', P, ...all).html).toBe(
      '<p>il gatto <strong>nero dorme</strong>. poi si sveglia</p>',
    )
    const up = run('upper', P, ...all)
    expect(up.html).toBe('<p>IL GATTO <strong>NERO DORME</strong>. POI SI SVEGLIA</p>')
    expect(up.sel).toEqual([1, 37])
  })

  it('Title Case: every word, also across formatting and after an apostrophe', () => {
    expect(run('title', P, ...all).html).toBe(
      '<p>Il Gatto <strong>Nero Dorme</strong>. Poi Si Sveglia</p>',
    )
    expect(run('title', "<p>l'albero</p>", 1, 9).html).toBe("<p>L'Albero</p>")
  })

  it('Sentence case: first letter of each sentence', () => {
    expect(run('sentence', '<p>IL GATTO DORME. POI SI SVEGLIA! E VA</p>', 1, 37).html).toBe(
      '<p>Il gatto dorme. Poi si sveglia! E va</p>',
    )
    // a selection in the middle of a word or a sentence keeps it going
    expect(run('sentence', '<p>Il gatto DORME</p>', 10, 15).html).toBe('<p>Il gatto dorme</p>')
    expect(run('title', '<p>gatTO</p>', 4, 6).html).toBe('<p>gatto</p>')
    // each paragraph starts a sentence
    expect(run('sentence', '<p>A B</p><p>C D</p>', 1, 9).html).toBe('<p>A b</p><p>C d</p>')
  })

  it('select all (Ctrl+A), twice in a row', () => {
    const doc = parse('<p>il gatto. poi</p>')
    let state = EditorState.create({ doc, selection: new AllSelection(doc) })
    changeCase('title')(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<p>Il Gatto. Poi</p>')
    changeCase('sentence')(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<p>Il gatto. Poi</p>')
  })

  it('each change is its own undo step', () => {
    const doc = parse('<p>ab</p>')
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 3),
      plugins: [history()],
    })
    const apply = (tr: Parameters<Parameters<ReturnType<typeof changeCase>>[1] & {}>[0]) =>
      (state = state.apply(tr))
    changeCase('upper')(state, apply)
    changeCase('lower')(state, apply)
    changeCase('title')(state, apply)
    undo(state, apply)
    expect(serializeHTML(state.doc)).toBe('<p>ab</p>')
    undo(state, apply)
    expect(serializeHTML(state.doc)).toBe('<p>AB</p>')
  })

  it('locale rules (e.g. German ß, Turkish i)', () => {
    expect(run('upper', '<p>straße</p>', 1, 7).html).toBe('<p>STRASSE</p>')
    expect(run('upper', '<p>istanbul</p>', 1, 9, 'tr').html).toBe('<p>İSTANBUL</p>')
  })

  it('needs a selection with letters', () => {
    expect(run('upper', '<p>abc</p>', 2, 2).ok).toBe(false)
    expect(run('upper', '<p>12 - !</p>', 1, 3).ok).toBe(true)
    expect(run('upper', '<p> - !</p>', 1, 4).ok).toBe(false)
  })

  it('the menu offers the four changes', () => {
    expect(caseMenu().entries.map((e) => e.id)).toEqual([
      'case-lower',
      'case-upper',
      'case-title',
      'case-sentence',
    ])
  })
})
