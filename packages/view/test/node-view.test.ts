// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  basicSchemaSpec,
  serializeHTML,
  type Node,
  type NodeSpec,
} from '@scriba/core'
import { EditorView, type NodeView } from '../src/index.js'

const widgetNodes = {
  widget: {
    group: 'block',
    atom: true,
    attrs: { value: { default: 0, validate: (v) => Number.isInteger(v) } },
    parseHTML: [{ tag: 'div[data-w]' }],
    toHTML: (node) => ['div', { 'data-w': String(node.attrs['value']) }],
  },
} satisfies Record<string, NodeSpec>
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...widgetNodes },
  marks: basicSchemaSpec.marks,
})
const widget = (value: number) => schema.nodes['widget']!.create({ value })
const para = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])

function setup(acceptUpdates = true) {
  const log: string[] = []
  const views: { view: NodeView; getPos: () => number | null }[] = []
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state: EditorState.create({ schema, doc: schema.node('doc', null, [para('ab'), widget(1)]) }),
    nodeViews: {
      widget: (node, _view, getPos) => {
        const dom = document.createElement('div')
        const input = document.createElement('input')
        dom.append(input)
        input.value = String(node.attrs['value'])
        log.push(`create ${node.attrs['value']}`)
        const nv: NodeView = {
          dom,
          update(next: Node) {
            log.push(`update ${next.attrs['value']}`)
            if (!acceptUpdates) return false
            input.value = String(next.attrs['value'])
            return true
          },
          selectNode: () => log.push('select'),
          deselectNode: () => log.push('deselect'),
          destroy: () => log.push('destroy'),
        }
        views.push({ view: nv, getPos })
        return nv
      },
    },
  })
  return { view, log, views }
}

describe('node views', () => {
  it('render the node with the custom DOM, made non-editable; HTML still from toHTML', () => {
    const { view, log, views } = setup()
    const dom = views[0]!.view.dom
    expect(view.dom.contains(dom)).toBe(true)
    expect(dom.getAttribute('contenteditable')).toBe('false')
    expect(dom.hasAttribute('data-scriba-node-view')).toBe(true)
    expect(log).toEqual(['create 1'])
    expect(serializeHTML(view.state.doc)).toBe('<p>ab</p><div data-w="1"></div>')
  })

  it('changed attributes go to update(); the DOM is kept', () => {
    const { view, log, views } = setup()
    view.dispatch(view.state.tr.setNodeAttrs(4, { value: 2 }))
    expect(log).toEqual(['create 1', 'update 2'])
    expect(view.dom.contains(views[0]!.view.dom)).toBe(true)
    expect(views[0]!.view.dom.querySelector('input')!.value).toBe('2')
  })

  it('update() returning false: rendered again, the old one destroyed', () => {
    const { view, log } = setup(false)
    view.dispatch(view.state.tr.setNodeAttrs(4, { value: 3 }))
    expect(log).toEqual(['create 1', 'update 3', 'create 3', 'destroy'])
  })

  it('getPos follows the node; deleted: destroyed, getPos null', () => {
    const { view, log, views } = setup()
    view.dispatch(view.state.tr.insertText('xyz', 1))
    expect(views[0]!.getPos()).toBe(7)
    view.dispatch(view.state.tr.delete(7, 8))
    expect(log.at(-1)).toBe('destroy')
    expect(views[0]!.getPos()).toBeNull()
  })

  it('selectNode / deselectNode follow the node selection', () => {
    const { view, log } = setup()
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 4)))
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 4)))
    view.dispatch(view.state.tr.setSelection(NodeSelection.near(view.state.doc.resolve(1))))
    expect(log).toEqual(['create 1', 'select', 'deselect'])
  })

  it('DOM changes inside a node view are left alone', async () => {
    const { view, views } = setup()
    const dom = views[0]!.view.dom
    const extra = document.createElement('span')
    extra.textContent = 'rendered by the component'
    dom.append(extra)
    await new Promise((r) => setTimeout(r, 0))
    expect(dom.contains(extra)).toBe(true)
    expect(view.dom.contains(dom)).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe('<p>ab</p><div data-w="1"></div>')
  })

  it('keys and input inside its form controls are not handled by the editor', () => {
    const { view, views } = setup()
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 4)))
    const input = views[0]!.view.dom.querySelector('input')!
    const key = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    input.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(false)
    const typed = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'x',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(typed)
    expect(typed.defaultPrevented).toBe(false)
    expect(view.state.doc.childCount).toBe(2)
  })

  it('destroying the editor destroys its node views', () => {
    const { view, log } = setup()
    view.destroy()
    expect(log.at(-1)).toBe('destroy')
  })
})
