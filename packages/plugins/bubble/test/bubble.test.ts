// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  keymap,
  runKeymaps,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { markItems } from '@scriba-editor/ui'
import { EditorView } from '@scriba-editor/view'
import { bubbleKeymap, bubbleMenu } from '../src/index.js'

const schema = new Schema(basicSchemaSpec)
const t = createTranslator('it')

function setup(editable = true) {
  const place = document.createElement('div')
  document.body.appendChild(place)
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('ciao mondo')]),
  ])
  const view = new EditorView(place, {
    state: EditorState.create({
      doc,
      plugins: [bubbleMenu({ items: markItems(schema), t, mac: false }), keymap(bubbleKeymap())],
    }),
    editable: () => editable,
  })
  view.focus()
  // this view's bubble (earlier tests' bubbles are still in the page)
  const bars = document.querySelectorAll('scriba-toolbar.scriba-bubble')
  const mine = bars[bars.length - 1] as HTMLElement
  const bar = () => mine
  const select = (from: number, to: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  return { view, bar, select }
}

describe('bubble menu', () => {
  it('shows for a text selection, hides when it collapses', () => {
    const { bar, select } = setup()
    expect(bar().hidden).toBe(true)
    select(1, 5)
    expect(bar().hidden).toBe(false)
    expect(bar().getAttribute('aria-label')).toBe('Formattazione della selezione')
    select(3, 3)
    expect(bar().hidden).toBe(true)
  })

  it('Alt+F10 focuses its first button only when shown', () => {
    const { view, bar, select } = setup()
    const alt = () =>
      runKeymaps(
        view.state,
        (tr) => view.dispatch(tr),
        { key: 'F10', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        view,
      )
    expect(alt()).toBe(false)
    select(1, 5)
    expect(alt()).toBe(true)
    expect(bar().contains(document.activeElement)).toBe(true)
  })

  it('never in read-only mode', () => {
    const { bar, select } = setup(false)
    select(1, 5)
    expect(bar().hidden).toBe(true)
  })

  it('above a mouse selection, below a touch selection (the system menu goes above)', () => {
    const { view, bar, select } = setup()
    view.coordsAtPos = () => ({ left: 100, right: 100, top: 300, bottom: 320 })
    Object.defineProperty(bar(), 'offsetHeight', { value: 40, configurable: true })
    const down = (pointerType: string) => {
      const event = new MouseEvent('pointerdown', { bubbles: true })
      Object.defineProperty(event, 'pointerType', { value: pointerType })
      view.dom.dispatchEvent(event)
    }
    down('mouse')
    select(1, 5)
    expect(bar().style.top).toBe('252px')
    select(1, 1)
    down('touch')
    select(1, 5)
    expect(bar().style.top).toBe('352px')
  })
})
