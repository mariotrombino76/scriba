// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba/core'
import {
  classFormatsMenu,
  classMarks,
  hasBlockClass,
  setBlockClass,
  textStyleMarks,
  withBlockClasses,
  withBlockStyles,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles(basicSchemaSpec.nodes), ['nota-margine', 'avviso']),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...classMarks(['evidenza', 'sigla']) },
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))

describe('integrator classes', () => {
  it('keeps the listed classes, on blocks and text', () => {
    expect(html('<p class="nota-margine">a</p><h2 class="avviso">T</h2>')).toBe(
      '<p class="nota-margine">a</p><h2 class="avviso">T</h2>',
    )
    expect(html('<p>a <span class="evidenza">b</span></p>')).toBe(
      '<p>a <span class="evidenza">b</span></p>',
    )
  })

  it('drops every other class (Word, Google Docs, pages), keeping the text', () => {
    expect(
      html(
        '<p class="MsoNormal scriba-callout nota-margine x" style="text-align:center">a <span class="c3 MsoHyperlink">b</span></p>',
      ),
    ).toBe('<p class="nota-margine" style="text-align: center">a b</p>')
    expect(html('<p class="avviso&quot; onclick=&quot;alert(1)">x</p>')).toBe('<p>x</p>')
  })

  it('one class per block and per span (the first listed one found)', () => {
    expect(html('<p class="avviso nota-margine">a</p>')).toBe('<p class="avviso">a</p>')
    expect(html('<p><span class="sigla evidenza">b</span></p>')).toBe(
      '<p><span class="sigla">b</span></p>',
    )
  })

  it('JSON with a class not in the list is refused', () => {
    const json = (attrs: Record<string, unknown>) => ({
      type: 'doc',
      content: [{ type: 'paragraph', attrs }],
    })
    expect(() => schema.nodeFromJSON(json({ className: 'avviso' }))).not.toThrow()
    expect(() => schema.nodeFromJSON(json({ className: 'x" onclick="y' }))).toThrow()
    expect(() => schema.nodeFromJSON(json({ className: 'MsoNormal' }))).toThrow()
  })

  it("refuses invalid configured names and the editor's own", () => {
    expect(() => withBlockClasses(basicSchemaSpec.nodes, ['Nota'])).toThrow()
    expect(() => withBlockClasses(basicSchemaSpec.nodes, ['a b'])).toThrow()
    expect(() => classMarks(['scriba-page-break'])).toThrow()
    expect(() => classMarks(['x" onclick="y'])).toThrow()
  })

  it('setBlockClass and the Styles menu toggle classes', () => {
    const doc = parse('<p>uno</p><p>due</p>')
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 2, 7) })
    const apply = (tr: Parameters<Parameters<ReturnType<typeof setBlockClass>>[1] & {}>[0]) =>
      (state = state.apply(tr))
    expect(setBlockClass('avviso')(state, apply)).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<p class="avviso">uno</p><p class="avviso">due</p>')
    expect(hasBlockClass(state, 'avviso')).toBe(true)
    expect(setBlockClass('MsoNormal')(state)).toBe(false)
    const menu = classFormatsMenu(schema, [
      { label: 'Avviso', class: 'avviso', kind: 'block' },
      { label: 'Evidenza', class: 'evidenza', kind: 'inline' },
    ])
    const [block, inline] = menu.entries
    expect(block!.isActive?.(state)).toBe(true)
    block!.command(state, apply)
    expect(serializeHTML(state.doc)).toBe('<p>uno</p><p>due</p>')
    inline!.command(state, apply)
    expect(serializeHTML(state.doc)).toBe(
      '<p>u<span class="evidenza">no</span></p><p><span class="evidenza">d</span>ue</p>',
    )
    expect(inline!.isActive?.(state)).toBe(true)
    inline!.command(state, apply)
    expect(serializeHTML(state.doc)).toBe('<p>uno</p><p>due</p>')
  })
})
