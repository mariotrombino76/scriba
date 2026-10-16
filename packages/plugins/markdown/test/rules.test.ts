// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  Selection,
  basicSchemaSpec,
  history,
  serializeHTML,
  undo,
} from '@scriba/core'
import { EditorView, someProp } from '@scriba/view'
import { listNodes } from '@scriba/plugin-list'
import { blockquoteNodes } from '@scriba/plugin-blockquote'
import { codeBlockNodes } from '@scriba/plugin-code-block'
import { linkMarks } from '@scriba/plugin-link'
import { markdownShortcuts, undoInputRule } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes, ...blockquoteNodes, ...codeBlockNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})

function setup() {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ schema, plugins: [history(), ...markdownShortcuts(schema)] }),
  })
  /** Types like the browser: each character goes through handleTextInput first. */
  const type = (text: string) => {
    for (const ch of text) {
      const { from, to } = view.state.selection
      if (!someProp(view.state, 'handleTextInput', (h) => h(view, from, to, ch)))
        view.dispatch(view.state.tr.insertText(ch))
    }
  }
  const html = () => serializeHTML(view.state.doc)
  const run = (cmd: typeof undo) => cmd(view.state, (tr) => view.dispatch(tr), view)
  return { view, type, html, run }
}

describe('block shortcuts', () => {
  it.each([
    ['# Titolo', '<h1>Titolo</h1>'],
    ['### Tre', '<h3>Tre</h3>'],
    ['- uno', '<ul><li><p>uno</p></li></ul>'],
    ['* uno', '<ul><li><p>uno</p></li></ul>'],
    ['1. uno', '<ol><li><p>uno</p></li></ol>'],
    ['3) tre', '<ol start="3"><li><p>tre</p></li></ol>'],
    ['> citazione', '<blockquote><p>citazione</p></blockquote>'],
    ['```js x', '<pre><code class="language-js">x</code></pre>'],
  ])('%j → %s', (input, out) => {
    const { type, html } = setup()
    type(input)
    expect(html()).toBe(out)
  })

  it('only at the start of a paragraph', () => {
    const { type, html } = setup()
    type('a # b - c')
    expect(html()).toBe('<p>a # b - c</p>')
  })

  it('a new list item joins the list just before', () => {
    const { view, type, html } = setup()
    type('- uno')
    // leave the list, then start a new bullet item right below
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, schema.node('paragraph')))
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
    type('- due')
    expect(html()).toBe('<ul><li><p>uno</p></li><li><p>due</p></li></ul>')
  })
})

describe('inline shortcuts', () => {
  it.each([
    ['a **grassetto** b', '<p>a <strong>grassetto</strong> b</p>'],
    ['__forte__ ok', '<p><strong>forte</strong> ok</p>'],
    ['un *corsivo* qui', '<p>un <em>corsivo</em> qui</p>'],
    ['un _corsivo_', '<p>un <em>corsivo</em></p>'],
    ['~~via~~', '<p><s>via</s></p>'],
    ['usa `npm i` ora', '<p>usa <code>npm i</code> ora</p>'],
    [
      'vedi [sito](https://example.com) qui',
      '<p>vedi <a href="https://example.com">sito</a> qui</p>',
    ],
  ])('%j → %s', (input, out) => {
    const { type, html } = setup()
    type(input)
    expect(html()).toBe(out)
  })

  it('does not fire inside words, on spaces at the edges, or in code', () => {
    const { type, html } = setup()
    type('snake_case_name 2 * 3 * 4 ** x **')
    expect(html()).toBe('<p>snake_case_name 2 * 3 * 4 ** x **</p>')
    const code = setup()
    code.type('```  **no**')
    expect(code.html()).toBe('<pre><code> **no**</code></pre>')
  })

  it('refuses unsafe link URLs (whitelist)', () => {
    const { type, html } = setup()
    type('[x](javascript:alert(1))')
    expect(html()).not.toContain('<a')
  })
})

describe('undo', () => {
  it('Backspace right after a shortcut gives back the typed text', () => {
    const { type, html, run } = setup()
    type('# ')
    expect(html()).toBe('<h1></h1>')
    expect(run(undoInputRule)).toBe(true)
    expect(html()).toBe('<p># </p>')
    // only right after: once typing goes on, Backspace is a normal Backspace
    type('x')
    expect(run(undoInputRule)).toBe(false)
  })

  it('Ctrl+Z undoes the shortcut first, then the typing', () => {
    const { type, html, run } = setup()
    type('**b**')
    expect(html()).toBe('<p><strong>b</strong></p>')
    run(undo)
    expect(html()).toBe('<p>**b**</p>')
  })
})

describe('IME and keyboards that write the DOM themselves (Android)', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0))
  function mounted(initial: string) {
    document.body.textContent = ''
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ schema, plugins: [history(), ...markdownShortcuts(schema)] }),
    })
    view.dispatch(view.state.tr.insertText(initial))
    view.focus()
    const text = () => view.dom.querySelector('p')!.firstChild as Text
    /** The browser writes `data` itself and puts the caret after it. */
    const browserWrites = (data: string) => {
      const node = text()
      node.data = data
      window.getSelection()!.setBaseAndExtent(node, data.length, node, data.length)
    }
    return { view, browserWrites, html: () => serializeHTML(view.state.doc) }
  }

  it('composition ending with "# " makes a heading', async () => {
    const { view, browserWrites, html } = mounted('#')
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    browserWrites('# ')
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: ' ' }))
    await tick()
    await tick()
    expect(html()).toBe('<h1></h1>')
  })

  it('a keyboard writing the DOM without beforeinput: "**bold**" becomes bold', async () => {
    const { browserWrites, html } = mounted('**bold*')
    browserWrites('**bold**')
    await tick()
    expect(html()).toBe('<p><strong>bold</strong></p>')
  })

  it('plain composed text is just text (no rule)', async () => {
    const { view, browserWrites, html } = mounted('ciao')
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    browserWrites('ciao mondo')
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: ' mondo' }))
    await tick()
    await tick()
    expect(html()).toBe('<p>ciao mondo</p>')
  })
})
