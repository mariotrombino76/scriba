// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { linkMarks } from '@scriba/plugin-link'
import { listNodes } from '@scriba/plugin-list'
import { SIZED_CLASS, createElementPath, createResizeHandle, elementPath } from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...listNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const HTML = '<ul><li><p>a <strong>bold <a href="https://x.it">link</a></strong></p></li></ul>'

function stateAt(pos: number) {
  const doc = parse(HTML)
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
}

describe('elementPath', () => {
  it('blocks outermost first, then the marks at the cursor, as HTML tags', () => {
    expect(elementPath(stateAt(13)).map((e) => e.tag)).toEqual(['ul', 'li', 'p', 'a', 'strong'])
    expect(elementPath(stateAt(4)).map((e) => e.tag)).toEqual(['ul', 'li', 'p'])
    expect(elementPath(stateAt(13)).map((e) => e.pos)).toEqual([0, 1, 2, null, null])
  })
})

describe('createElementPath', () => {
  function mount() {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, { state: stateAt(13) })
    const path = createElementPath(view, t)
    document.body.appendChild(path.el)
    return { view, path }
  }

  it('a labelled list; a block button selects that block', () => {
    const { view, path } = mount()
    expect(path.el.getAttribute('aria-label')).toBe("Percorso dell'elemento")
    const buttons = [...path.el.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['ul', 'li', 'p'])
    expect(buttons[2]!.getAttribute('aria-current')).toBe('location')
    expect(buttons[0]!.title).toBe('Seleziona ul')
    expect([...path.el.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['a', 'strong'])
    // one tab stop, arrows move it
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0])
    buttons[2]!.focus()
    buttons[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1])
    buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(buttons[0])
    buttons[1]!.click()
    const sel = view.state.selection
    expect(sel instanceof NodeSelection && sel.node.type.name).toBe('list_item')
    // follows the selection
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)))
    expect([...path.el.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'ul',
      'li',
      'p',
    ])
    path.destroy()
    view.destroy()
    expect(path.el.isConnected).toBe(false)
  })
})

describe('createResizeHandle', () => {
  it('arrows change the height (within the limits), Escape and double-click restore it', () => {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, { state: stateAt(4) })
    // jsdom has no layout: the editor reports the height it was given
    let height = 300
    view.dom.getBoundingClientRect = () => ({ height }) as DOMRect
    const handle = createResizeHandle(view, t, { minHeight: 200, maxHeight: 400 })
    const key = (k: string) =>
      handle.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }))
    expect(handle.el.getAttribute('aria-label')).toContain('Ridimensiona')
    key('ArrowDown')
    expect(view.dom.style.height).toBe('320px')
    expect(view.dom.classList.contains(SIZED_CLASS)).toBe(true)
    height = 320
    key('PageDown')
    expect(view.dom.style.height).toBe('400px') // the maximum
    height = 400
    key('ArrowUp')
    expect(view.dom.style.height).toBe('380px')
    height = 210
    key('PageUp')
    expect(view.dom.style.height).toBe('200px') // the minimum
    key('Escape')
    expect(view.dom.style.height).toBe('')
    expect(view.dom.classList.contains(SIZED_CLASS)).toBe(false)
    key('ArrowDown')
    handle.el.dispatchEvent(new MouseEvent('dblclick'))
    expect(view.dom.style.height).toBe('')
    // the editor's own styles stay
    expect(view.dom.style.whiteSpace).toBe('pre-wrap')
    handle.destroy()
    view.destroy()
  })
})
