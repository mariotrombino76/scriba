// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
  type Command,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import { codeBlockNodes } from '../../code-block/src/index.js'
import { linkMarks } from '../../link/src/index.js'
import { textStyleMarks, withBlockStyles } from '../../text-style/src/index.js'
import {
  PAINTING_CLASS,
  cancelFormatPainter,
  copiedFormat,
  copyFormat,
  formatPainter,
  formatPainterItem,
  formatPainterKeymap,
  isFormatPainterArmed,
  pasteFormat,
  toggleFormatPainter,
} from '../src/index.js'

const schema = new Schema({
  nodes: withBlockStyles({ ...basicSchemaSpec.nodes, ...codeBlockNodes }),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...linkMarks },
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

// "Ciao " 1-6, "bello" 6-11, " mondo" 11-17; the heading's text 19-25
const HTML =
  '<p>Ciao <strong><em>bello</em></strong> mondo</p><h2 style="text-align: center">Titolo</h2>'

function editor(html = HTML, options?: Parameters<typeof formatPainter>[1]) {
  let state = EditorState.create({
    doc: parse(html),
    schema,
    plugins: [history(), formatPainter(t, options)],
  })
  const select = (from: number, to = from) => {
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
  }
  const run = (command: Command) => command(state, (tr) => (state = state.apply(tr)))
  return {
    get state() {
      return state
    },
    html: () => serializeHTML(state.doc),
    select,
    run,
  }
}

describe('format painter', () => {
  it('needs the plugin', () => {
    const state = EditorState.create({ doc: parse(HTML), schema })
    expect(copyFormat(state)).toBe(false)
    expect(toggleFormatPainter(state)).toBe(false)
    expect(pasteFormat(state)).toBe(false)
  })

  it('copies the marks at the cursor and gives them to the selected text', () => {
    const e = editor()
    e.select(8)
    expect(e.run(copyFormat)).toBe(true)
    expect(copiedFormat(e.state)!.marks.map((m) => m.type.name)).toEqual(['bold', 'italic'])
    e.select(12, 17)
    expect(e.run(pasteFormat)).toBe(true)
    expect(e.html()).toContain('<strong><em>bello</em></strong> <strong><em>mondo</em></strong>')
  })

  it('a cursor in a word formats the whole word', () => {
    const e = editor()
    e.select(8)
    e.run(copyFormat)
    e.select(14)
    e.run(pasteFormat)
    expect(e.html()).toContain(' <strong><em>mondo</em></strong></p>')
  })

  it('replaces the formatting of the target; links stay', () => {
    const e = editor(
      '<p><span style="color: #b91c1c">rosso</span> <u><a href="https://example.com">link</a></u></p>',
    )
    e.select(3)
    e.run(copyFormat)
    e.select(7, 11)
    e.run(pasteFormat)
    expect(e.html()).toBe(
      '<p><span style="color: #b91c1c">rosso</span> <span style="color: #b91c1c"><a href="https://example.com">link</a></span></p>',
    )
  })

  it('from a selection, only the marks all of its text has', () => {
    const e = editor()
    e.select(3, 9) // "ao " + "bel": only part is bold
    e.run(copyFormat)
    expect(copiedFormat(e.state)!.marks).toEqual([])
  })

  it('a whole block selected also gets the block: type, level and alignment', () => {
    const e = editor()
    e.select(20)
    e.run(copyFormat)
    e.select(1, 17)
    e.run(pasteFormat)
    // the heading's text has no marks: the paragraph's bold goes too, as in Word
    expect(e.html()).toBe(
      '<h2 style="text-align: center">Ciao bello mondo</h2>' +
        '<h2 style="text-align: center">Titolo</h2>',
    )
  })

  it('part of a block: only the marks, the block stays as it is', () => {
    const e = editor()
    e.select(20)
    e.run(copyFormat)
    e.select(12, 17)
    e.run(pasteFormat)
    expect(e.html()).toBe(HTML)
  })

  it('an empty block with the cursor in it gets the block look; the next text the marks', () => {
    const e = editor('<p style="text-align: right"><strong>forte</strong></p><p></p>')
    e.select(3)
    e.run(copyFormat)
    e.select(8)
    e.run(pasteFormat)
    e.run((state, dispatch) => {
      dispatch?.(state.tr.insertText('nuovo'))
      return true
    })
    expect(e.html()).toBe(
      '<p style="text-align: right"><strong>forte</strong></p>' +
        '<p style="text-align: right"><strong>nuovo</strong></p>',
    )
  })

  it('a code block gets no marks and stays a code block', () => {
    const e = editor('<h2><strong>forte</strong></h2><pre><code>x = 1</code></pre>')
    e.select(3)
    e.run(copyFormat)
    e.select(9, 14) // all the code
    e.run(pasteFormat)
    expect(e.html()).toBe('<h2><strong>forte</strong></h2><pre><code>x = 1</code></pre>')
    e.select(11) // between "x" and " = 1": no word, the next typed text
    e.run(pasteFormat)
    expect(e.state.storedMarks).toEqual([])
  })

  it('never copies an id, even when asked', () => {
    const e = editor(HTML, { blockAttrs: ['id', 'align'] })
    e.select(20)
    e.run(copyFormat)
    expect(copiedFormat(e.state)!.block!.attrs).toEqual({ align: 'center', level: 2 })
  })

  it('the button waits for the target once; pressed again or Esc stops it', () => {
    const e = editor()
    e.select(8)
    expect(e.run(toggleFormatPainter)).toBe(true)
    expect(isFormatPainterArmed(e.state)).toBe(true)
    expect(formatPainterItem().isActive!(e.state)).toBe(true)
    e.select(14)
    e.run(pasteFormat)
    expect(isFormatPainterArmed(e.state)).toBe(false)
    // the copied format stays: Ctrl+Alt+V can use it again
    expect(copiedFormat(e.state)).not.toBeNull()

    e.run(toggleFormatPainter)
    expect(e.run(toggleFormatPainter)).toBe(true)
    expect(isFormatPainterArmed(e.state)).toBe(false)
    e.run(toggleFormatPainter)
    expect(e.run(cancelFormatPainter)).toBe(true)
    expect(isFormatPainterArmed(e.state)).toBe(false)
    // Esc does nothing (lets others handle it) when not waiting
    expect(e.run(cancelFormatPainter)).toBe(false)
    expect(formatPainterKeymap()['Escape']).toBe(cancelFormatPainter)
  })

  it('one undo step brings everything back', () => {
    const e = editor()
    e.select(20)
    e.run(copyFormat)
    e.select(1, 17)
    e.run(pasteFormat)
    e.run(undo)
    expect(e.html()).toBe(HTML)
  })
})

describe('format painter in the editor', () => {
  function mount() {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ doc: parse(HTML), schema, plugins: [formatPainter(t)] }),
    })
    return { view, place }
  }

  it('while waiting: a class for the cursor and a message for screen readers', () => {
    const { view, place } = mount()
    toggleFormatPainter(view.state, (tr) => view.dispatch(tr))
    expect(view.dom.classList.contains(PAINTING_CLASS)).toBe(true)
    const live = place.querySelector('[role="status"]')!
    expect(live.textContent).toBe(t('formatPainter.armed'))
    cancelFormatPainter(view.state, (tr) => view.dispatch(tr))
    expect(view.dom.classList.contains(PAINTING_CLASS)).toBe(false)
    expect(live.textContent).toBe(t('formatPainter.off'))
    view.destroy()
    expect(place.querySelector('[role="status"]')).toBeNull()
  })
})
