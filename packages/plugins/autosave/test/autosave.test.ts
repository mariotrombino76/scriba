// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection, history, serializeHTML, undo } from '@scriba/core'
import { EditorView } from '@scriba/view'
import { doc, p, schema } from '../../../core/test/helpers/schema.js'
import {
  autosave,
  clearDraft,
  readDraft,
  restoreDraft,
  restoreDraftItem,
  type DraftStorage,
} from '../src/index.js'

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function mount(storage: DraftStorage, text = 'a') {
  const d = doc(p(text))
  const options = { key: 'nota-1', storage, delay: 1000 }
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: d,
      selection: TextSelection.create(d, 2),
      plugins: [history(), autosave(options)],
    }),
  })
  return { view, options, type: (t: string) => view.dispatch(view.state.tr.insertText(t)) }
}

describe('autosave', () => {
  it('nothing saved until the user changes something; then after the pause', () => {
    const storage = memory()
    const { type } = mount(storage)
    vi.advanceTimersByTime(5000)
    expect(storage.data.size).toBe(0) // opening the editor does not overwrite a draft
    type('b')
    vi.advanceTimersByTime(900)
    expect(storage.data.size).toBe(0)
    vi.advanceTimersByTime(200)
    expect(JSON.parse(storage.data.get('nota-1')!).doc.content[0].content[0].text).toBe('ab')
  })

  it('closing the editor saves the last changes', () => {
    const storage = memory()
    const { view, type } = mount(storage)
    type('z')
    view.destroy()
    expect(storage.data.has('nota-1')).toBe(true)
  })

  it('restore: the draft comes back as one undoable change; clearDraft forgets it', () => {
    const storage = memory()
    const first = mount(storage)
    first.type(' bozza')
    vi.advanceTimersByTime(1000)
    const { view, options } = mount(storage, 'vecchio')
    expect(restoreDraftItem(options).command(view.state)).toBe(true)
    expect(restoreDraft(view, options)).toBe(true)
    expect(serializeHTML(view.state.doc)).toBe('<p>a bozza</p>')
    expect(restoreDraftItem(options).command(view.state)).toBe(false) // already shown
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(serializeHTML(view.state.doc)).toBe('<p>vecchio</p>')
    clearDraft(options)
    expect(readDraft(schema, options)).toBeNull()
  })

  it('a tampered draft is untrusted input: refused by the schema', () => {
    const storage = memory()
    const options = { key: 'k', storage }
    storage.setItem(
      'k',
      JSON.stringify({
        v: 1,
        savedAt: 1,
        doc: { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] },
      }),
    )
    expect(readDraft(schema, options)).toBeNull()
    storage.setItem('k', '{not json')
    expect(readDraft(schema, options)).toBeNull()
    storage.setItem(
      'k',
      JSON.stringify({
        v: 1,
        savedAt: 1,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
      }),
    )
    expect(readDraft(schema, options)).toBeNull()
  })

  it('too big, full or blocked storage: no draft, no error', () => {
    const storage = memory()
    const big = mount(storage)
    expect(readDraft(schema, { key: 'x', storage, maxLength: 10 })).toBeNull()
    const failing: DraftStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    const { type } = mount(failing)
    type('x')
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    expect(readDraft(schema, { key: 'nota-1', storage: failing })).toBeNull()
    big.view.destroy()
  })
})
