import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  type Command,
} from '@scriba-editor/core'
import { JSDOM } from 'jsdom'
import {
  changeIndent,
  isAligned,
  markValue,
  setMarkValue,
  setTextAlign,
  textStyleMarks,
  textStyleToolbarItems,
  withBlockStyles,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockStyles(basicSchemaSpec.nodes),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks },
})
const { DOMParser } = new JSDOM('').window
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const roundTrip = (html: string) => serializeHTML(parse(html))

function run(html: string, from: number, to: number, cmd: Command): string | null {
  const doc = parse(html)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })
  const ok = cmd(state, (tr) => (state = state.apply(tr)))
  return ok ? serializeHTML(state.doc) : null
}

describe('block styles', () => {
  it('parses and serializes alignment and indentation', () => {
    expect(roundTrip('<p style="text-align: center">a</p>')).toBe(
      '<p style="text-align: center">a</p>',
    )
    expect(roundTrip('<h2 style="text-align:right; margin-left: 4em">t</h2>')).toBe(
      '<h2 style="text-align: right; margin-left: 4em">t</h2>',
    )
    // legacy align attribute and TinyMCE padding-left
    expect(roundTrip('<p align="justify" style="padding-left: 64px">a</p>')).toBe(
      '<p style="text-align: justify; margin-left: 4em">a</p>',
    )
    expect(roundTrip('<p style="text-align: evil; margin-left: 99999px">a</p>')).toBe(
      '<p style="margin-left: 16em">a</p>',
    )
  })

  it('aligns and indents the selected blocks', () => {
    expect(run('<p>a</p><p>b</p>', 1, 4, setTextAlign('center'))).toBe(
      '<p style="text-align: center">a</p><p style="text-align: center">b</p>',
    )
    expect(run('<p>a</p>', 1, 1, changeIndent(1))).toBe('<p style="margin-left: 2em">a</p>')
    expect(run('<p>a</p>', 1, 1, changeIndent(-1))).toBeNull()
  })

  it('reports alignment', () => {
    const doc = parse('<p style="text-align:center">a</p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
    expect(isAligned(state, 'center')).toBe(true)
    expect(isAligned(state, 'left')).toBe(false)
  })
})

describe('text style marks', () => {
  it('parses colors, highlights, fonts and sizes (Word / Google Docs markup)', () => {
    expect(roundTrip('<p><span style="color: rgb(192, 57, 43)">r</span></p>')).toBe(
      '<p><span style="color: #c0392b">r</span></p>',
    )
    expect(roundTrip('<p><font color="red" face="Arial">x</font></p>')).toBe(
      '<p><span style="color: #ff0000"><span style="font-family: Arial">x</span></span></p>',
    )
    expect(
      roundTrip('<p><span style="background-color:#FFFF00;font-size:12.0pt">y</span></p>'),
    ).toBe(
      '<p><span style="background-color: #ffff00"><span style="font-size: 12pt">y</span></span></p>',
    )
  })

  it('drops injection attempts and keeps the text', () => {
    expect(
      roundTrip('<p><span style="color: red; background: url(javascript:alert(1))">x</span></p>'),
    ).toBe('<p><span style="color: #ff0000">x</span></p>')
    expect(roundTrip('<p><span style="color: expression(alert(1))">x</span></p>')).toBe('<p>x</p>')
    expect(roundTrip(`<p><span style="font-family: x'); } body { display:none">y</span></p>`)).toBe(
      '<p>y</p>',
    )
    expect(roundTrip('<p><span style="font-size: calc(9999px)">z</span></p>')).toBe('<p>z</p>')
  })

  it('rejects non-normalized values from JSON (collaboration input)', () => {
    expect(() => schema.mark('text_color', { color: 'red' })).toThrow()
    expect(() => schema.mark('text_color', { color: '#FF0000' })).toThrow()
    expect(schema.mark('text_color', { color: '#ff0000' }).attrs['color']).toBe('#ff0000')
  })

  it('sets and removes mark values', () => {
    const color = schema.marks.text_color!
    expect(run('<p>abc</p>', 2, 3, setMarkValue(color, { color: '#1d4ed8' }))).toBe(
      '<p>a<span style="color: #1d4ed8">b</span>c</p>',
    )
    expect(
      run('<p><span style="color:#1d4ed8">abc</span></p>', 1, 4, setMarkValue(color, null)),
    ).toBe('<p>abc</p>')
    const doc = parse('<p><span style="color:#1d4ed8">abc</span></p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 4) })
    expect(markValue(state, color, 'color')).toBe('#1d4ed8')
  })

  it('builds toolbar items for what the schema has', () => {
    const ids = textStyleToolbarItems(schema).map((i) => (i.type === 'separator' ? '|' : i.id))
    expect(ids).toEqual([
      'align', 'indent-less', 'indent-more', 'text-color', 'background-color', 'font-family', 'font-size',
    ]) // prettier-ignore
  })
})
