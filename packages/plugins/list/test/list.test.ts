import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
  type Command,
  type Node,
} from '@scriba/core'
import { blockquoteNodes } from '@scriba/plugin-blockquote'
import { JSDOM } from 'jsdom'
import {
  liftListItem,
  liftListItemAtStart,
  listNodes,
  sinkListItem,
  splitListItem,
  toggleList,
  wrapInList,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...blockquoteNodes, ...listNodes },
  marks: basicSchemaSpec.marks,
})
const { bullet_list: ul, ordered_list: ol, list_item: item } = schema.nodes

const { DOMParser } = new JSDOM('').window
/** Builds docs from HTML; `|` marks the cursor, `[` `]` a selection. */
function state(html: string): EditorState {
  const clean = html.replace(/[|[\]]/g, '')
  const doc = parseHTML(schema, new DOMParser().parseFromString(clean, 'text/html').body)
  // find marker positions by text: insert markers as unique chars then locate them in the doc
  const tagged = html.replace('|', '\u0001').replace('[', '\u0001').replace(']', '\u0002')
  const tdoc = parseHTML(schema, new DOMParser().parseFromString(tagged, 'text/html').body)
  let a = -1
  let b = -1
  tdoc.descendants((n, pos) => {
    if (!n.isText) return
    let shift = 0
    for (let i = 0; i < n.text.length; i++) {
      const ch = n.text[i]
      if (ch === '\u0001') a = pos + i - shift++
      if (ch === '\u0002') b = pos + i - shift++
    }
  })
  if (a < 0) throw new Error('no cursor marker')
  if (b >= 0) b -= 1 // the start marker was removed before it
  return EditorState.create({ doc, selection: TextSelection.create(doc, a, b < 0 ? a : b) })
}

/** Runs a command and checks that inverting its steps restores the document exactly. */
function run(s: EditorState, cmd: Command): EditorState | null {
  let next: EditorState | null = null
  const ok = cmd(s, (tr) => {
    let doc = tr.doc
    for (let i = tr.steps.length - 1; i >= 0; i--)
      doc = tr.steps[i]!.invert(tr.docs[i]!).apply(doc).doc!
    expect(doc.eq(s.doc)).toBe(true)
    next = s.apply(tr)
  })
  return ok ? next : null
}

const html = (doc: Node) => serializeHTML(doc)

describe('list nodes', () => {
  it('parse and serialize nested lists', () => {
    const input = '<ul><li><p>a</p><ol start="3"><li><p>b</p></li></ol></li><li><p>c</p></li></ul>'
    const doc = parseHTML(schema, new DOMParser().parseFromString(input, 'text/html').body)
    expect(html(doc)).toBe(input)
  })

  it('wraps loose li text in paragraphs and rejects bad start values', () => {
    const doc = parseHTML(
      schema,
      new DOMParser().parseFromString('<ol start="-5"><li>x</li></ol><li>loose</li>', 'text/html')
        .body,
    )
    expect(html(doc)).toBe('<ol><li><p>x</p></li></ol><p>loose</p>')
  })
})

describe('wrap and toggle', () => {
  it('wraps each paragraph in its own item', () => {
    const r = run(state('<p>[a</p><p>b</p><p>c]</p>'), wrapInList(ul, item))!
    expect(html(r.doc)).toBe('<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>')
  })

  it('toggles off and switches list type', () => {
    const on = run(state('<p>a|b</p>'), toggleList(ol, item))!
    expect(html(on.doc)).toBe('<ol><li><p>ab</p></li></ol>')
    const switched = run(on, toggleList(ul, item))!
    expect(html(switched.doc)).toBe('<ul><li><p>ab</p></li></ul>')
    const off = run(switched, toggleList(ul, item))!
    expect(html(off.doc)).toBe('<p>ab</p>')
    expect(off.selection.head).toBe(2)
  })
})

describe('Enter', () => {
  it('splits an item', () => {
    expect(html(run(state('<ul><li><p>a|b</p></li></ul>'), splitListItem(item))!.doc)).toBe(
      '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
    )
    expect(html(run(state('<ul><li><p>ab|</p></li></ul>'), splitListItem(item))!.doc)).toBe(
      '<ul><li><p>ab</p></li><li><p></p></li></ul>',
    )
  })

  it('leaves the list from an empty item', () => {
    const s = run(state('<ul><li><p>a|</p></li></ul>'), splitListItem(item))!
    const out = run(s, splitListItem(item))!
    expect(html(out.doc)).toBe('<ul><li><p>a</p></li></ul><p></p>')
  })

  it('does nothing outside lists', () => {
    expect(run(state('<p>a|</p>'), splitListItem(item))).toBeNull()
  })
})

describe('Tab / Shift+Tab', () => {
  it('sinks an item into a new sub-list', () => {
    const r = run(state('<ul><li><p>a</p></li><li><p>b|</p></li></ul>'), sinkListItem(item))!
    expect(html(r.doc)).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>')
  })

  it('sinks into an existing sub-list', () => {
    const r = run(
      state('<ul><li><p>a</p><ul><li><p>x</p></li></ul></li><li><p>b|</p></li></ul>'),
      sinkListItem(item),
    )!
    expect(html(r.doc)).toBe(
      '<ul><li><p>a</p><ul><li><p>x</p></li><li><p>b</p></li></ul></li></ul>',
    )
  })

  it('cannot sink the first item', () => {
    expect(run(state('<ul><li><p>a|</p></li></ul>'), sinkListItem(item))).toBeNull()
  })

  it('lifts a nested item, adopting the following siblings', () => {
    const r = run(
      state('<ul><li><p>a</p><ul><li><p>b|</p></li><li><p>c</p></li></ul></li></ul>'),
      liftListItem(item),
    )!
    expect(html(r.doc)).toBe(
      '<ul><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ul>',
    )
  })

  it('lifts top-level items out of the list, splitting it', () => {
    const r = run(
      state('<ul><li><p>a</p></li><li><p>b|</p></li><li><p>c</p></li></ul>'),
      liftListItem(item),
    )!
    expect(html(r.doc)).toBe('<ul><li><p>a</p></li></ul><p>b</p><ul><li><p>c</p></li></ul>')
  })

  it('sink then lift returns to the start (and the cursor stays in the text)', () => {
    const start = state('<ul><li><p>a</p></li><li><p>b|c</p></li></ul>')
    const sunk = run(start, sinkListItem(item))!
    const back = run(sunk, liftListItem(item))!
    expect(back.doc.eq(start.doc)).toBe(true)
    expect(back.doc.textBetween(back.selection.head - 1, back.selection.head)).toBe('b')
  })

  it('Backspace at the start of an item outdents', () => {
    const r = run(state('<ul><li><p>a</p></li><li><p>|b</p></li></ul>'), liftListItemAtStart(item))!
    expect(html(r.doc)).toBe('<ul><li><p>a</p></li></ul><p>b</p>')
    expect(run(state('<ul><li><p>a|b</p></li></ul>'), liftListItemAtStart(item))).toBeNull()
  })
})
