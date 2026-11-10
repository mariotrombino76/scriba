// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { blockPermissions, withBlockIds } from '@scriba-editor/plugin-permissions'
import { EditorView } from '@scriba-editor/view'
import {
  autosave,
  draftTransaction,
  restoreDraft,
  restoreDraftItem,
  type DraftStorage,
} from '../src/index.js'

const t = createTranslator('it')
const schema = new Schema({
  nodes: withBlockIds(basicSchemaSpec.nodes),
  marks: basicSchemaSpec.marks,
})
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const LOCK = '<p data-block-id="lock-1">fisso</p>'

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}
const draftOf = (html: string) =>
  JSON.stringify({ v: 1, savedAt: Date.now(), doc: parse(html).toJSON() })

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

function mount(source: string, draft: string | null, delay = 60_000) {
  const place = document.createElement('div')
  document.body.replaceChildren(place)
  const storage = memory()
  if (draft) storage.setItem('nota', draftOf(draft))
  const options = { key: 'nota', storage, delay }
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: parse(source),
      plugins: [
        history(),
        autosave(options),
        ...blockPermissions({ canEdit: (id) => !id.startsWith('lock'), t }),
      ],
    }),
  })
  return { view, options, storage }
}

describe('restoring a draft', () => {
  it('changes only the blocks that differ', () => {
    const state = EditorState.create({ doc: parse('<p>a</p><p>b</p><p>c</p><p>d</p>') })
    const tr = draftTransaction(state, parse('<p>a</p><p>B</p><p>c</p><p>D</p>'))!
    expect(tr.steps).toHaveLength(2)
    expect(serializeHTML(state.apply(tr).doc)).toBe('<p>a</p><p>B</p><p>c</p><p>D</p>')
    // blocks added or removed in the middle
    const grown = draftTransaction(state, parse('<p>a</p><p>x</p><p>y</p><p>z</p><p>d</p>'))!
    expect(serializeHTML(state.apply(grown).doc)).toBe('<p>a</p><p>x</p><p>y</p><p>z</p><p>d</p>')
    expect(draftTransaction(state, state.doc)).toBeNull()
  })

  it('a document with a protected block: the draft is restored around it', () => {
    const { view, options } = mount(`<p>uno</p>${LOCK}<p>due</p>`, `<p>uno!</p>${LOCK}<p>due!</p>`)
    expect(restoreDraft(view, options)).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe(`<p>uno!</p>${LOCK}<p>due!</p>`)
    undo(view.state, (tr) => view.dispatch(tr))
    expect(serializeHTML(view.state.doc)).toBe(`<p>uno</p>${LOCK}<p>due</p>`)
    view.destroy()
  })

  it('a draft that changes a protected block is refused, and the dialog says why', () => {
    const { view, options } = mount(
      `<p>uno</p>${LOCK}`,
      `<p>uno</p><p data-block-id="lock-1">cambiato</p>`,
    )
    expect(restoreDraft(view, options)).toBe(false)
    restoreDraftItem(options, t).run!(view)
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('blocchi protetti')
    expect(serializeHTML(view.state.doc)).toBe(`<p>uno</p>${LOCK}`)
    dialog.querySelector('button')!.click()
    expect(document.activeElement).toBe(view.dom)
    view.destroy()
  })
})

describe('saving before the page goes away', () => {
  it('reload or closing the tab: the waiting changes are saved at once', () => {
    const { view, storage } = mount('<p>a</p>', null)
    view.dispatch(view.state.tr.insertText('b', 2))
    expect(storage.data.size).toBe(0) // the delay is not over
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.data.get('nota')).toContain('ab')
    view.destroy()
  })

  it('hidden page (another tab, phone locked): saved too', () => {
    const { view, storage } = mount('<p>a</p>', null)
    view.dispatch(view.state.tr.insertText('c', 2))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(storage.data.get('nota')).toContain('ac')
    view.destroy()
    // after destroy the listeners are gone
    window.dispatchEvent(new Event('pagehide'))
  })
})
