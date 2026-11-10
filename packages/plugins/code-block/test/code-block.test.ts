// @vitest-environment jsdom
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
import { EditorView, stateDecorations } from '@scriba-editor/view'
import { common, createLowlight } from 'lowlight'
import {
  codeBlockNodes,
  codeHighlight,
  exitCodeBlock,
  exitOnTripleEnter,
  resetEmptyCodeBlock,
  setCodeLanguage,
  toggleCodeBlock,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...codeBlockNodes },
  marks: basicSchemaSpec.marks,
})
const lowlight = createLowlight(common)
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

function run(html: string, from: number, to: number, cmd: Command) {
  const doc = parse(html)
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) })
  const ok = cmd(state, (tr) => (state = state.apply(tr)))
  return { ok, html: serializeHTML(state.doc), state }
}

describe('code block node', () => {
  it('parses and serializes the language', () => {
    expect(
      serializeHTML(parse('<pre><code class="hljs language-JavaScript">let x</code></pre>')),
    ).toBe('<pre><code class="language-javascript">let x</code></pre>')
    expect(serializeHTML(parse('<pre data-language="python">a\n  b</pre>'))).toBe(
      '<pre><code class="language-python">a\n  b</code></pre>',
    )
  })

  it('keeps only validated languages and escapes code that looks like HTML', () => {
    const doc = parse(
      '<pre><code class="language-x&quot;onclick=alert(1) evil">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    )
    expect(serializeHTML(doc)).toBe('<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>')
    expect(() => schema.node('code_block', { language: 'js" onclick="x' })).toThrow()
  })

  it('drops formatting inside code', () => {
    expect(serializeHTML(parse('<pre><b>bold</b> <a href="https://x.it">link</a></pre>'))).toBe(
      '<pre><code>bold link</code></pre>',
    )
  })
})

describe('commands', () => {
  it('toggles code blocks and sets the language', () => {
    const on = run('<p>a</p>', 1, 1, toggleCodeBlock)
    expect(on.html).toBe('<pre><code>a</code></pre>')
    let state = on.state
    setCodeLanguage('css')(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<pre><code class="language-css">a</code></pre>')
    toggleCodeBlock(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<p>a</p>')
    expect(setCodeLanguage('css')(state)).toBe(false)
  })

  it('leaves a code block with Mod+Enter or a triple Enter', () => {
    expect(run('<pre>x</pre>', 2, 2, exitCodeBlock).html).toBe('<pre><code>x</code></pre><p></p>')
    const triple = run('<pre>x\n\n</pre>', 4, 4, exitOnTripleEnter)
    expect(triple.html).toBe('<pre><code>x</code></pre><p></p>')
    expect(triple.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(run('<pre>x\n</pre>', 3, 3, exitOnTripleEnter).ok).toBe(false)
  })

  it('Backspace in an empty code block makes it a paragraph', () => {
    expect(run('<pre></pre>', 1, 1, resetEmptyCodeBlock).html).toBe('<p></p>')
    expect(run('<pre>x</pre>', 1, 1, resetEmptyCodeBlock).ok).toBe(false)
  })
})

describe('highlighting', () => {
  it('produces token decorations, not markup', () => {
    const doc = parse('<pre><code class="language-javascript">const x = "y"</code></pre>')
    const state = EditorState.create({ doc, plugins: [codeHighlight({ lowlight })] })
    const index = stateDecorations(state)
    expect(index.forBlock(1)).toEqual([
      { from: 0, to: 5, cls: 'hljs-keyword' },
      { from: 10, to: 13, cls: 'hljs-string' },
    ])
  })

  it('skips unknown languages, plain blocks and oversized blocks', () => {
    const doc = parse('<pre><code class="language-nope">x</code></pre><pre>const y</pre>')
    const state = EditorState.create({ doc, plugins: [codeHighlight({ lowlight })] })
    expect(stateDecorations(state).forBlock(1)).toEqual([])
    const big = parse(
      `<pre><code class="language-javascript">${'const a = 1\n'.repeat(20)}</code></pre>`,
    )
    const limited = EditorState.create({
      doc: big,
      plugins: [codeHighlight({ lowlight, maxLength: 50 })],
    })
    expect(stateDecorations(limited).forBlock(1)).toEqual([])
  })

  it('renders highlighted spans in the view and keeps editing exact', () => {
    document.body.textContent = ''
    const place = document.body.appendChild(document.createElement('div'))
    const doc = parse('<pre><code class="language-javascript">let a</code></pre>')
    const view = new EditorView(place, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 6),
        plugins: [codeHighlight({ lowlight })],
      }),
    })
    expect(view.dom.innerHTML).toBe(
      '<pre><code class="language-javascript"><span class="hljs-keyword">let</span> a</code></pre>',
    )
    view.dom.dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertText', data: 'b', cancelable: true }),
    )
    expect(serializeHTML(view.state.doc)).toBe(
      '<pre><code class="language-javascript">let ab</code></pre>',
    )
    expect(view.dom.innerHTML).toBe(
      '<pre><code class="language-javascript"><span class="hljs-keyword">let</span> ab</code></pre>',
    )
  })
})
