// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  NodeSelection,
  basicSchemaSpec,
  baseKeymap,
  createParagraphNear,
  parseHTML,
  serializeHTML,
  type Command,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { codeBlockNodes } from '@scriba/plugin-code-block'
import { markdownInputRules, parseMarkdown, serializeMarkdown } from '@scriba/plugin-markdown'
import { EditorView, parseInertHTML } from '@scriba/view'
import {
  hrNodes,
  hrPlugins,
  hrSlashItems,
  hrToolbarItems,
  insertHorizontalRule,
  insertPageBreak,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...codeBlockNodes, ...hrNodes },
  marks: basicSchemaSpec.marks,
})
const parse = (html: string) => parseHTML(schema, parseInertHTML(html).body)

/** Runs `cmd` with the cursor at the `|` of the HTML. */
function run(html: string, cmd: Command) {
  const at = html.indexOf('|')
  let doc = parse(html.replace('|', ''))
  // position of the n-th text character: walk the text
  let pos = 0
  let seen = 0
  doc.descendants((node, p) => {
    if (pos) return false
    if (node.isText) {
      const before = html.slice(0, at).replace(/<[^>]*>/g, '').length
      if (seen + node.text!.length >= before) pos = p + (before - seen)
      seen += node.text!.length
    }
    return true
  })
  if (!pos) pos = 1
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
  const ok = cmd(state, (tr) => (state = state.apply(tr)))
  doc = state.doc
  return { ok, html: serializeHTML(doc), from: state.selection.from, state }
}

describe('hr nodes', () => {
  it('a line is a bare <hr>; a page break keeps only its class', () => {
    expect(serializeHTML(parse('<hr class="x" id="y"><hr class="a scriba-page-break">'))).toBe(
      '<hr><hr class="scriba-page-break">',
    )
  })
})

describe('insert commands', () => {
  it('splits the paragraph at the cursor; the cursor goes to the text after', () => {
    const r = run('<p>ab|cd</p>', insertHorizontalRule)
    expect(r.html).toBe('<p>ab</p><hr><p>cd</p>')
    expect(r.state.selection.$from.parent.textContent).toBe('cd')
    expect(r.state.selection.$from.parentOffset).toBe(0)
  })

  it('in an empty paragraph it takes its place; at the end a paragraph follows', () => {
    const r = run('<p>a</p><p>|</p>', insertPageBreak)
    expect(r.html).toBe('<p>a</p><hr class="scriba-page-break"><p></p>')
    expect(r.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(run('<p>ab|</p>', insertHorizontalRule).html).toBe('<p>ab</p><hr><p></p>')
  })

  it('not in code', () => {
    expect(run('<pre><code>a|b</code></pre>', insertHorizontalRule).ok).toBe(false)
  })

  it('toolbar and slash entries', () => {
    expect(hrToolbarItems(schema).map((i) => i.id)).toEqual(['hr', 'pagebreak'])
    expect(hrSlashItems(schema).map((i) => i.keywords.includes('pagina'))).toEqual([false, true])
  })
})

describe('Markdown', () => {
  it('--- is a line both ways; a page break is written as a line', () => {
    expect(serializeHTML(parseMarkdown(schema, 'a\n\n---\n\nb'))).toBe('<p>a</p><hr><p>b</p>')
    expect(serializeMarkdown(parse('<p>a</p><hr><hr class="scriba-page-break"><p>b</p>'))).toBe(
      'a\n\n---\n\n---\n\nb\n',
    )
  })

  it('typing --- alone in a paragraph makes a line', () => {
    const rule = markdownInputRules(schema).find((r) => r.match.test('---'))!
    const doc = parse('<p>---</p>')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) })
    const tr = rule.apply(state, rule.match.exec('---')!, 1, 4)!
    expect(serializeHTML(tr.doc)).toBe('<hr><p></p>')
    expect(tr.selection.$from.parent.type.name).toBe('paragraph')
    // with text before, no rule
    const other = parse('<p>x---</p>')
    expect(rule.apply(EditorState.create({ doc: other }), rule.match.exec('---')!, 2, 5)).toBeNull()
  })
})

describe('hrPlugins', () => {
  it('page breaks are named for screen readers in the editor only', () => {
    document.body.textContent = ''
    const place = document.createElement('div')
    document.body.append(place)
    const doc = parse('<p>a</p><hr class="scriba-page-break"><hr>')
    const view = new EditorView(place, {
      state: EditorState.create({ doc, plugins: hrPlugins(createTranslator('it')) }),
    })
    const [pageBreak, line] = [...view.dom.querySelectorAll('hr')]
    expect(pageBreak!.getAttribute('aria-label')).toBe('Interruzione di pagina')
    expect(line!.hasAttribute('aria-label')).toBe(false)
    expect(serializeHTML(view.state.doc)).toBe('<p>a</p><hr class="scriba-page-break"><hr>')
  })
})

describe('a selected line, like any selected block', () => {
  const selected = (html: string, at: number) => {
    const doc = parse(html)
    return EditorState.create({ doc, selection: NodeSelection.create(doc, at) })
  }

  it('Enter: a paragraph after it, or before it when it is the first block', () => {
    let state = selected('<p>a</p><hr><p>b</p>', 3)
    expect(baseKeymap['Enter']!(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<p>a</p><hr><p></p><p>b</p>')
    expect(state.selection.from).toBe(5)
    state = selected('<hr><p>b</p>', 0)
    expect(createParagraphNear(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<p></p><hr><p>b</p>')
    expect(state.selection.from).toBe(1)
  })

  it('typing replaces it with a paragraph holding the text, where it was', () => {
    document.body.textContent = ''
    const place = document.createElement('div')
    document.body.append(place)
    const view = new EditorView(place, { state: selected('<p>a</p><hr><p>b</p>', 3) })
    view.dom.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'x',
        cancelable: true,
        bubbles: true,
      }),
    )
    expect(serializeHTML(view.state.doc)).toBe('<p>a</p><p>x</p><p>b</p>')
    expect(view.state.selection.from).toBe(5)
  })
})
