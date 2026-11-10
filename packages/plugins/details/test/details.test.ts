// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  baseKeymap,
  basicSchemaSpec,
  chainCommands,
  history,
  parseHTML,
  serializeHTML,
  undo,
  type Command,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import { serializeMarkdown } from '@scriba-editor/plugin-markdown'
import {
  detailsAutoOpen,
  detailsKeymap,
  detailsNodeView,
  detailsNodes,
  detailsToolbarItem,
  enterFromSummary,
  insertDetails,
  removeDetails,
  removeEmptyDetails,
  toggleDetailsOpen,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...detailsNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const OPEN = '<details open=""><summary>Titolo</summary><p>Testo</p></details>'
const CLOSED = '<details><summary>Titolo</summary><p>Testo</p></details>'

function stateOf(input: string, from: number, to = from) {
  const doc = parse(input)
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, from, to),
    plugins: [history(), detailsAutoOpen()],
  })
}
function run(command: Command, input: string, from: number, to = from) {
  let state = stateOf(input, from, to)
  const ok = command(state, (tr) => (state = state.apply(tr)))
  return { ok, state, html: serializeHTML(state.doc) }
}

describe('details nodes', () => {
  it('round trip, open or closed', () => {
    expect(html(OPEN)).toBe(OPEN)
    expect(html(CLOSED)).toBe(CLOSED)
    expect(html('<details open="open"><summary>Titolo</summary><p>Testo</p></details>')).toBe(OPEN)
  })

  it('a section without title gets an empty one, keeping its content', () => {
    expect(html('<details><p>Testo</p></details>')).toBe(
      '<details><summary></summary><p>Testo</p></details>',
    )
  })

  it('loose text after the title becomes a paragraph, not a second title', () => {
    expect(html('<details><summary>Titolo</summary>Testo</details>')).toBe(CLOSED)
  })

  it('an empty section gets an empty paragraph; nested sections are kept', () => {
    expect(html('<details><summary>T</summary></details>')).toBe(
      '<details><summary>T</summary><p></p></details>',
    )
    const nested = `<details open=""><summary>A</summary>${CLOSED}</details>`
    expect(html(nested)).toBe(nested)
  })

  it('a <summary> outside a section keeps its text', () => {
    expect(html('<summary>Solo</summary><p>x</p>')).toBe('<p>Solo</p><p>x</p>')
  })

  it('drops every attribute but open', () => {
    expect(
      html(
        '<details open id="x" class="y" onclick="alert(1)" style="color:red" ontoggle="alert(2)">' +
          '<summary onclick="alert(3)" id="z">Titolo</summary><p>Testo</p></details>',
      ),
    ).toBe(OPEN)
  })

  it('Markdown and plain text keep the title and the content', () => {
    expect(serializeMarkdown(parse(OPEN))).toBe('Titolo\n\nTesto\n')
  })
})

describe('insertDetails', () => {
  it('puts the selected blocks in an open section, cursor in the empty title', () => {
    const { ok, state, html: out } = run(insertDetails(schema), '<p>a</p><p>b</p>', 1, 4)
    expect(ok).toBe(true)
    expect(out).toBe('<details open=""><summary></summary><p>a</p><p>b</p></details>')
    expect(state.selection.$from.parent.type.name).toBe('details_summary')
  })

  it('not inside a title', () => {
    expect(run(insertDetails(schema), OPEN, 3).ok).toBe(false)
  })

  it('the toolbar button takes the content out again (the title becomes a paragraph)', () => {
    const item = detailsToolbarItem(schema)
    expect(item.isActive?.(stateOf(OPEN, 9))).toBe(true)
    expect(run(item.command, OPEN, 9).html).toBe('<p>Titolo</p><p>Testo</p>')
    expect(
      run(removeDetails(schema), '<details><summary></summary><p>a</p></details>', 5).html,
    ).toBe('<p>a</p>')
  })
})

describe('toggleDetailsOpen', () => {
  it('closing with the cursor in the content moves it to the end of the title', () => {
    const { state, html: out } = run(toggleDetailsOpen, OPEN, 12)
    expect(out).toBe(CLOSED)
    expect(state.selection.from).toBe(8)
  })

  it('opens and closes; undo brings it back', () => {
    const { state } = run(toggleDetailsOpen, OPEN, 3)
    expect(serializeHTML(state.doc)).toBe(CLOSED)
    let s = state
    undo(s, (tr) => (s = s.apply(tr)))
    expect(serializeHTML(s.doc)).toBe(OPEN)
    expect(run(toggleDetailsOpen, '<p>a</p>', 1).ok).toBe(false)
  })
})

describe('keyboard', () => {
  const keys = detailsKeymap()

  it('Enter in the title goes to the content, opening the section', () => {
    // the first block is not empty: a new paragraph before it
    const { state, html: out } = run(enterFromSummary, CLOSED, 8)
    expect(out).toBe('<details open=""><summary>Titolo</summary><p></p><p>Testo</p></details>')
    expect(state.selection.$from.parent.type.name).toBe('paragraph')
    expect(state.selection.from).toBe(10)
    // an empty first block: the cursor goes there
    const empty = run(enterFromSummary, '<details open><summary>T</summary><p></p></details>', 3)
    expect(empty.html).toBe('<details open=""><summary>T</summary><p></p></details>')
    expect(empty.state.selection.from).toBe(5)
  })

  it('Enter elsewhere is not handled', () => {
    expect(run(enterFromSummary, OPEN, 10).ok).toBe(false)
  })

  it('Backspace in an empty section removes it; not when something is in it', () => {
    const empty = '<details open><summary></summary><p></p></details>'
    const { state, html: out } = run(keys['Backspace']!, empty, 2)
    expect(out).toBe('<p></p>')
    expect(state.selection.from).toBe(1)
    expect(
      run(removeEmptyDetails, '<details open><summary></summary><p>a</p></details>', 2).ok,
    ).toBe(false)
    expect(run(removeEmptyDetails, OPEN, 2).ok).toBe(false)
  })

  it('Backspace at the start of a title does not merge it into the block before', () => {
    const backspace = chainCommands(removeEmptyDetails, baseKeymap['Backspace']!)
    expect(run(backspace, `<p>prima</p>${OPEN}`, 9).html).toBe(`<p>prima</p>${OPEN}`)
  })
})

describe('detailsAutoOpen', () => {
  it('opens a closed section when the cursor moves into its content', () => {
    let state = stateOf(CLOSED, 3)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 10)))
    expect(serializeHTML(state.doc)).toBe(OPEN)
  })

  it('the cursor in the title leaves it closed', () => {
    let state = stateOf(`<p>x</p>${CLOSED}`, 1)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)))
    expect(serializeHTML(state.doc)).toBe(`<p>x</p>${CLOSED}`)
  })
})

describe('detailsNodeView', () => {
  function mount(input: string, editable = true) {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ schema, doc: parse(input), plugins: [detailsAutoOpen()] }),
      editable: () => editable,
      nodeViews: { details: detailsNodeView(t) },
    })
    const dom = place.querySelector<HTMLElement>('.scriba-details')!
    const button = dom.querySelector<HTMLButtonElement>('.scriba-details-toggle')!
    return { view, dom, button }
  }

  it('a labelled button opens and closes the section in the document', () => {
    const { view, dom, button } = mount(OPEN)
    expect(button.getAttribute('aria-label')).toBe('Apri o chiudi la sezione')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(dom.hasAttribute('data-open')).toBe(true)
    expect(dom.querySelector('summary')?.textContent).toBe('Titolo')
    button.click()
    expect(serializeHTML(view.state.doc)).toBe(CLOSED)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(dom.hasAttribute('data-open')).toBe(false)
    view.destroy()
  })

  it('read-only: opens and closes on screen only', () => {
    const { view, dom, button } = mount(CLOSED, false)
    button.click()
    expect(dom.hasAttribute('data-open')).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe(CLOSED)
    view.destroy()
  })
})

describe('base keys inside a section', () => {
  const enter = chainCommands(enterFromSummary, baseKeymap['Enter']!)
  const backspace = chainCommands(removeEmptyDetails, baseKeymap['Backspace']!)

  it('Enter in an empty last paragraph leaves the section', () => {
    const input = '<details open><summary>T</summary><p>a</p><p></p></details>'
    expect(run(enter, input, 8).html).toBe(
      '<details open=""><summary>T</summary><p>a</p></details><p></p>',
    )
  })

  it('Backspace at the start of the content does not merge it into the title', () => {
    expect(run(backspace, OPEN, 10).html).toBe(OPEN)
  })
})
