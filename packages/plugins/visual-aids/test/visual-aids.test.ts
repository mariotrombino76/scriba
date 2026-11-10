// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, basicSchema, parseHTML, serializeHTML } from '@scriba-editor/core'
import { EditorView } from '@scriba-editor/view'
import {
  SHOW_BLOCKS_CLASS,
  getVisualAids,
  toggleVisualBlocks,
  toggleVisualChars,
  visualAids,
  visualAidsItems,
} from '../src/index.js'

const parse = (html: string) =>
  parseHTML(basicSchema, new DOMParser().parseFromString(html, 'text/html').body)
const HTML = '<p>10&nbsp;km e super\u00adcalifragilistico</p><h2>T</h2>'

function mount(plugins = [visualAids()]) {
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state: EditorState.create({ doc: parse(HTML), plugins }),
  })
  const run = (command: typeof toggleVisualBlocks) => command(view.state, (tr) => view.dispatch(tr))
  return { view, run }
}

describe('visual aids', () => {
  it('off by default; the commands need the plugin', () => {
    const state = EditorState.create({ doc: parse(HTML) })
    expect(getVisualAids(state)).toEqual({ blocks: false, chars: false })
    expect(toggleVisualBlocks(state)).toBe(false)
  })

  it('show blocks: a class on the editor, the HTML does not change', () => {
    const { view, run } = mount()
    expect(view.dom.classList.contains(SHOW_BLOCKS_CLASS)).toBe(false)
    expect(run(toggleVisualBlocks)).toBe(true)
    expect(view.dom.classList.contains(SHOW_BLOCKS_CLASS)).toBe(true)
    expect(visualAidsItems()[0]!.isActive?.(view.state)).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe(serializeHTML(parse(HTML)))
    run(toggleVisualBlocks)
    expect(view.dom.classList.contains(SHOW_BLOCKS_CLASS)).toBe(false)
    run(toggleVisualBlocks)
    view.destroy()
    expect(view.dom.classList.contains(SHOW_BLOCKS_CLASS)).toBe(false)
  })

  it('show invisible characters: no-break spaces and soft hyphens highlighted, not saved', () => {
    const { view, run } = mount()
    expect(view.dom.querySelectorAll('.scriba-char-nbsp, .scriba-char-shy')).toHaveLength(0)
    run(toggleVisualChars)
    const nbsp = view.dom.querySelectorAll('.scriba-char-nbsp')
    expect([...nbsp].map((el) => el.textContent)).toEqual(['\u00a0'])
    expect([...view.dom.querySelectorAll('.scriba-char-shy')].map((el) => el.textContent)).toEqual([
      '\u00ad',
    ])
    expect(serializeHTML(view.state.doc)).not.toContain('scriba-char')
    // typing keeps them in sync
    view.dispatch(view.state.tr.insertText('\u00a0', 1))
    expect(view.dom.querySelectorAll('.scriba-char-nbsp')).toHaveLength(2)
    run(toggleVisualChars)
    expect(view.dom.querySelectorAll('.scriba-char-nbsp')).toHaveLength(0)
    view.destroy()
  })

  it('work in read-only mode (they do not change the document)', () => {
    expect(visualAidsItems().every((item) => item.readOnly)).toBe(true)
  })
})
