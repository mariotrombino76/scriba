// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, basicSchema, parseHTML, serializeHTML, type Node } from '@scriba/core'
import { EditorView } from '@scriba/view'
import {
  isDirty,
  isSaving,
  markSaved,
  saveCommand,
  saveItem,
  saveKeymap,
  savePlugin,
} from '../src/index.js'

const parse = (html: string) =>
  parseHTML(basicSchema, new DOMParser().parseFromString(html, 'text/html').body)

function mount() {
  const place = document.createElement('div')
  document.body.appendChild(place)
  return new EditorView(place, {
    state: EditorState.create({ doc: parse('<p>uno</p>'), plugins: [savePlugin()] }),
  })
}
const run = (view: EditorView, command: ReturnType<typeof saveCommand>) =>
  command(view.state, (tr) => view.dispatch(tr), view)
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('save', () => {
  it('nothing to save until the document changes; saving clears it', async () => {
    const saved: string[] = []
    const view = mount()
    const options = { save: (doc: Node) => void saved.push(serializeHTML(doc)) }
    const item = saveItem(options)
    expect(item.command(view.state)).toBe(false)
    view.dispatch(view.state.tr.insertText('!', 4))
    expect(isDirty(view.state)).toBe(true)
    expect(item.command(view.state)).toBe(true)
    expect(run(view, saveCommand(options))).toBe(true)
    expect(isSaving(view.state)).toBe(true)
    expect(item.command(view.state)).toBe(false) // not twice at once
    await flush()
    expect(saved).toEqual(['<p>uno!</p>'])
    expect(isSaving(view.state)).toBe(false)
    expect(isDirty(view.state)).toBe(false)
    // back to the saved content (e.g. undo): nothing to save again
    view.dispatch(view.state.tr.insertText('?', 5))
    view.dispatch(view.state.tr.delete(5, 6))
    expect(isDirty(view.state)).toBe(false)
    view.destroy()
  })

  it('a failed save keeps the changes "not saved" and reports the error', async () => {
    const errors: unknown[] = []
    const view = mount()
    view.dispatch(view.state.tr.insertText('!', 4))
    run(
      view,
      saveCommand({
        save: () => Promise.reject(new Error('rete')),
        onError: (e) => errors.push(e),
      }),
    )
    await flush()
    expect(errors).toHaveLength(1)
    expect(isDirty(view.state)).toBe(true)
    expect(isSaving(view.state)).toBe(false)
    view.destroy()
  })

  it('edits made while saving stay unsaved', async () => {
    let finish = () => {}
    const view = mount()
    view.dispatch(view.state.tr.insertText('!', 4))
    run(view, saveCommand({ save: () => new Promise<void>((r) => (finish = r)) }))
    view.dispatch(view.state.tr.insertText('?', 5))
    finish()
    await flush()
    expect(isDirty(view.state)).toBe(true)
    view.destroy()
  })

  it('Ctrl+S is always taken (no browser "save page" dialog); markSaved', () => {
    const view = mount()
    const keys = saveKeymap({ save: () => {} })
    expect(keys['Mod-s']!(view.state, (tr) => view.dispatch(tr), view)).toBe(true)
    view.dispatch(view.state.tr.insertText('!', 4))
    markSaved(view)
    expect(isDirty(view.state)).toBe(false)
    view.destroy()
  })
})
