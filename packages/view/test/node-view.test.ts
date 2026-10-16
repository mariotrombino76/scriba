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

describe('node views with content', () => {
  const boxNodes = {
    box: {
      group: 'block',
      content: 'block+',
      attrs: { kind: { default: 'info', validate: (v) => v === 'info' || v === 'warning' } },
      parseHTML: [{ tag: 'aside' }],
      toHTML: (node) => ['aside', { 'data-kind': node.attrs['kind'] as string }, 0],
    },
  } satisfies Record<string, NodeSpec>
  const boxSchema = new Schema({
    nodes: { ...basicSchemaSpec.nodes, ...boxNodes },
    marks: basicSchemaSpec.marks,
  })
  const bp = (text: string) => boxSchema.node('paragraph', null, text ? [boxSchema.text(text)] : [])

  function setupBox(withContent = true) {
    const log: string[] = []
    let header: HTMLElement | null = null
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({
        schema: boxSchema,
        doc: boxSchema.node('doc', null, [
          bp('a'),
          boxSchema.nodes['box']!.create({ kind: 'info' }, [bp('in')]),
        ]),
      }),
      nodeViews: {
        box: (node) => {
          const dom = document.createElement('div')
          header = document.createElement('div')
          header.setAttribute('contenteditable', 'false')
          header.textContent = String(node.attrs['kind'])
          header.append(document.createElement('button'))
          const contentDOM = document.createElement('div')
          dom.append(header, contentDOM)
          log.push('create')
          return {
            dom,
            contentDOM: withContent ? contentDOM : null,
            update(next) {
              log.push(`update ${next.attrs['kind']}`)
              header!.firstChild!.textContent = String(next.attrs['kind'])
              return true
            },
          }
        },
      },
    })
    return { view, log, header: () => header! }
  }

  it('the editor renders the content inside contentDOM; HTML from toHTML', () => {
    const { view } = setupBox()
    const content = view.dom.querySelector('[data-scriba-node-content]')!
    expect(content.innerHTML).toBe('<p>in</p>')
    expect(view.dom.querySelector('[data-scriba-node-view]')!.hasAttribute('contenteditable')).toBe(
      false,
    )
    expect(serializeHTML(view.state.doc)).toBe('<p>a</p><aside data-kind="info"><p>in</p></aside>')
  })

  it('content edits and attribute changes keep the node view', () => {
    const { view, log } = setupBox()
    const dom = view.dom.querySelector('[data-scriba-node-view]')
    view.dispatch(view.state.tr.insertText('X', 6))
    view.dispatch(view.state.tr.setNodeAttrs(3, { kind: 'warning' }))
    expect(view.dom.querySelector('[data-scriba-node-view]')).toBe(dom)
    expect(view.dom.querySelector('[data-scriba-node-content]')!.innerHTML).toBe('<p>iXn</p>')
    expect(log).toEqual(['create', 'update info', 'update warning'])
  })

  it('text the browser writes inside the content is read; the header is left alone', async () => {
    const { view, header } = setupBox()
    const text = view.dom.querySelector('[data-scriba-node-content] p')!.firstChild as Text
    text.data = 'inn'
    header().append(document.createElement('span'))
    await new Promise((r) => setTimeout(r, 0))
    expect(view.state.doc.child(1).textContent).toBe('inn')
    expect(header().querySelector('span')).not.toBeNull()
    // typing inside the content is the editor's, a click on the header button is not
    const typed = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'z',
      bubbles: true,
      cancelable: true,
    })
    view.dom.querySelector('[data-scriba-node-content] p')!.dispatchEvent(typed)
    expect(typed.defaultPrevented).toBe(true)
    const press = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    header().querySelector('button')!.dispatchEvent(press)
    expect(press.defaultPrevented).toBe(false)
  })

  it('a node view of a node with content must give a contentDOM', () => {
    expect(() => setupBox(false)).toThrow(/needs a contentDOM/)
  })
})
