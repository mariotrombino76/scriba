// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection, serializeHTML } from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { clipboardItems, type ToolbarButton } from '../src/index.js'
import { controlUsable } from '../src/items.js'
import { b, doc, p } from '../../core/test/helpers/schema.js'

const t = createTranslator('it')
const items = clipboardItems(t, { mac: false })
const item = (id: string) => items.find((i) => i.id === id)! as ToolbarButton

beforeAll(() => {
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

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'execCommand')
  Reflect.deleteProperty(navigator, 'clipboard')
})

function setup(from = 2, to = 4, editable = true) {
  document.body.textContent = ''
  const place = document.createElement('div')
  document.body.append(place)
  const d = doc(p('a', b('bc'), 'd'))
  return new EditorView(place, {
    state: EditorState.create({ doc: d, selection: TextSelection.create(d, from, to) }),
    editable: () => editable,
  })
}

/** document.execCommand (missing in jsdom): `ok` is what the browser answers. */
function execCommand(ok: boolean) {
  const calls: string[] = []
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: (command: string) => (calls.push(command), ok),
  })
  return calls
}

function clipboard(api: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: api })
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const html = (view: EditorView) => serializeHTML(view.state.doc)
const message = () => document.querySelector('dialog p')?.textContent ?? null

describe('clipboardItems', () => {
  it('Edit menu order like TinyMCE; copy also read-only, cut and paste not', () => {
    expect(items.map((i) => [i.id, i.label(t), i.shortcut])).toEqual([
      ['cut', 'Taglia', 'Mod-x'],
      ['copy', 'Copia', 'Mod-c'],
      ['paste', 'Incolla', 'Mod-v'],
      ['paste-text', 'Incolla come testo', 'Mod-Shift-v'],
    ])
    const view = setup(2, 4, false)
    expect(items.map((i) => controlUsable(view, i))).toEqual([false, true, false, false])
    expect(item('copy').command(view.state)).toBe(true)
    expect(item('copy').command(setup(2, 2).state)).toBe(false) // nothing selected
  })

  it('copy and cut use the browser copy event first (the editor fills it)', async () => {
    const view = setup()
    const calls = execCommand(true)
    item('copy').run!(view)
    item('cut').run!(view)
    await flush()
    expect(calls).toEqual(['copy', 'cut'])
    expect(message()).toBeNull()
  })

  it('then the Clipboard API, with the serializer HTML and plain text', async () => {
    const view = setup()
    execCommand(false)
    const written: Record<string, string> = {}
    class FakeItem {
      constructor(readonly data: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', FakeItem)
    clipboard({
      write: async (list: ClipboardItems) => {
        for (const [type, blob] of Object.entries((list[0] as unknown as FakeItem).data))
          written[type] = await blob.text()
      },
    })
    item('cut').run!(view)
    await flush()
    await flush()
    expect(written).toEqual({ 'text/html': '<strong>bc</strong>', 'text/plain': 'bc' })
    expect(html(view)).toBe('<p>ad</p>') // cut: removed once written
  })

  it('paste reads the clipboard and inserts it like a paste event (sanitized)', async () => {
    const view = setup(2, 2)
    const blob = (type: string, text: string) => new Blob([text], { type })
    clipboard({
      read: async () => [
        {
          types: ['text/html', 'text/plain'],
          getType: async (type: string) =>
            type === 'text/html'
              ? blob(type, '<em onclick="alert(1)">X</em><script>alert(1)</script>')
              : blob(type, 'X'),
        } as unknown as ClipboardItem,
      ],
    })
    item('paste').run!(view)
    await flush()
    await flush()
    expect(html(view)).toBe('<p>a<em>X</em><strong>bc</strong>d</p>')
    // as text: the formatting of the copied HTML is dropped
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)))
    item('paste-text').run!(view)
    await flush()
    await flush()
    expect(html(view)).toBe('<p>a<em>X</em><strong>bc</strong>dX</p>')
  })

  it('when the browser refuses, a message says which keys to use', async () => {
    const view = setup(2, 2)
    clipboard({ read: () => Promise.reject(new DOMException('no', 'NotAllowedError')) })
    item('paste').run!(view)
    await flush()
    expect(message()).toBe('Il browser non permette al menu di usare gli appunti. Usa Ctrl+V.')
    document.querySelector<HTMLButtonElement>('dialog button')!.click()
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(view.dom)
    execCommand(false) // no Clipboard API either
    item('copy').run!(view.state.selection.empty ? setup() : view)
    await flush()
    expect(message()).toContain('Usa Ctrl+C.')
  })
})
