// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { EditorState, Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { blockPermissions, withBlockIds } from '@scriba/plugin-permissions'
import { EditorView } from '@scriba/view'
import { newDocument, openFile } from '../src/index.js'

const t = createTranslator('it')
const schema = new Schema({
  nodes: withBlockIds(basicSchemaSpec.nodes),
  marks: basicSchemaSpec.marks,
})

beforeAll(() => {
  // jsdom has no modal dialogs: enough of showModal/close for these tests
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal(this: HTMLDialogElement): void
    close(this: HTMLDialogElement): void
  }
  proto.showModal ??= function () {
    this.open = true
  }
  proto.close ??= function () {
    this.open = false
  }
})

function mount(source: string) {
  const place = document.createElement('div')
  document.body.replaceChildren(place)
  const doc = parseHTML(schema, new DOMParser().parseFromString(source, 'text/html').body)
  const plugins = blockPermissions({ canEdit: (id) => !id.startsWith('lock'), t })
  return new EditorView(place, { state: EditorState.create({ doc, plugins }) })
}

describe('replacing a document with protected blocks', () => {
  const SOURCE = '<p>libero</p><p data-block-id="lock-1">protetto</p>'

  it('"New document" says why it cannot, instead of doing nothing', () => {
    const view = mount(SOURCE)
    newDocument(view, { t })
    const dialog = document.querySelector('dialog')!
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.textContent).toContain('blocchi protetti')
    expect(serializeHTML(view.state.doc)).toBe(
      '<p>libero</p><p data-block-id="lock-1">protetto</p>',
    )
    const close = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Chiudi')!
    expect(document.activeElement).toBe(close)
    close.click()
    expect(dialog.isConnected).toBe(false)
    expect(document.activeElement).toBe(view.dom)
    view.destroy()
  })

  it('opening a file is refused the same way, before reading it', () => {
    const view = mount(SOURCE)
    openFile(view, new File(['<p>altro</p>'], 'a.html', { type: 'text/html' }), { t })
    expect(document.querySelector('dialog')!.textContent).toContain('blocchi protetti')
    expect(serializeHTML(view.state.doc)).toContain('protetto')
    view.destroy()
  })

  it('"New document" with onNewDocument: the app creates the document, nothing is refused', () => {
    const view = mount(SOURCE)
    const created: EditorView[] = []
    newDocument(view, { t, onNewDocument: (v) => created.push(v) })
    expect(created).toEqual([view])
    expect(document.querySelector('dialog')).toBeNull()
    view.destroy()
  })

  it('without protected blocks, "New document" empties the document', () => {
    const view = mount('<p>libero</p><p data-block-id="b-1">anche</p>')
    newDocument(view, { t })
    expect(document.querySelector('dialog')).toBeNull()
    expect(serializeHTML(view.state.doc)).toBe('<p></p>')
    view.destroy()
  })
})
