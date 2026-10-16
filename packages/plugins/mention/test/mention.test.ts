// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorState,
  Schema,
  basicSchemaSpec,
  history,
  undo,
  keymap,
  parseHTML,
  runKeymaps,
  serializeHTML,
  TextSelection,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView, someProp } from '@scriba/view'
import { serializeMarkdown } from '@scriba/plugin-markdown'
import {
  cleanResults,
  getMentionState,
  mentionKeymap,
  mentionNodes,
  mentions,
  type MentionItem,
  type MentionSearch,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...mentionNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const PEOPLE: MentionItem[] = [
  { id: 'u1', label: 'Anna Rossi', detail: 'Redazione' },
  { id: 'u2', label: 'Bruno Bianchi' },
  { id: 'u3', label: 'Carla Verdi' },
]
const dom = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

function setup(search?: MentionSearch, initial = '<p></p>') {
  const calls: { query: string; signal: AbortSignal }[] = []
  const source: MentionSearch =
    search ??
    ((query, signal) => {
      calls.push({ query, signal })
      const q = query.toLowerCase()
      return Promise.resolve(PEOPLE.filter((p) => p.label.toLowerCase().includes(q)))
    })
  const place = document.createElement('div')
  document.body.appendChild(place)
  const doc = parseHTML(schema, dom(initial))
  const view = new EditorView(place, {
    state: EditorState.create({
      schema,
      doc,
      plugins: [
        ...mentions({ search: source, t, debounce: 100 }),
        keymap(mentionKeymap(), { priority: 110 }),
        history(),
      ],
    }),
  })
  view.focus()
  const type = (text: string) => {
    for (const ch of text) {
      const { from, to } = view.state.selection
      if (!someProp(view.state, 'handleTextInput', (h) => h(view, from, to, ch)))
        view.dispatch(view.state.tr.insertText(ch))
    }
  }
  const key = (name: string) =>
    runKeymaps(
      view.state,
      (tr) => view.dispatch(tr),
      { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false },
      view,
    )
  const html = () => serializeHTML(view.state.doc)
  const listbox = () => document.getElementById(view.dom.getAttribute('aria-controls') ?? '')
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(150)
  }
  return { view, type, key, html, calls, listbox, settle }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('mention node', () => {
  it('serializes as a span with the id; the label is escaped text', () => {
    const node = schema.nodes['mention']!.create({ id: 'u1', label: '<b>Anna</b> & co' })
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [node])])
    expect(serializeHTML(doc)).toBe(
      '<p><span class="scriba-mention" data-mention-id="u1">@&lt;b&gt;Anna&lt;/b&gt; &amp; co</span></p>',
    )
  })

  it('parses back (round trip) and reads the label from the text', () => {
    const html = '<p>Ciao <span class="scriba-mention" data-mention-id="u1">@Anna Rossi</span>!</p>'
    expect(serializeHTML(parseHTML(schema, dom(html)))).toBe(html)
    const loose = parseHTML(
      schema,
      dom('<p><span data-mention-id="x-9">  @ Anna\n Rossi </span></p>'),
    )
    expect(loose.firstChild!.firstChild!.attrs).toEqual({ id: 'x-9', label: 'Anna Rossi' })
  })

  it('invalid ids or labels: the text stays, no mention', () => {
    for (const bad of [
      '<span data-mention-id="">@Anna</span>',
      '<span data-mention-id="a b">@Anna</span>',
      `<span data-mention-id="${'x'.repeat(201)}">@Anna</span>`,
      '<span data-mention-id="u1">@</span>',
      '<span data-mention-id="u1‮">@Anna</span>',
      `<span data-mention-id="u1">@${'A'.repeat(101)}</span>`,
    ]) {
      const doc = parseHTML(schema, dom(`<p>${bad}</p>`))
      expect(doc.firstChild!.childCount === 0 || doc.firstChild!.firstChild!.isText).toBe(true)
    }
  })

  it('plain text and Markdown show "@label"', () => {
    const doc = parseHTML(schema, dom('<p>Per <span data-mention-id="u1">@Anna *Rossi*</span></p>'))
    expect(doc.textContent).toBe('Per @Anna *Rossi*')
    expect(serializeMarkdown(doc)).toBe('Per @Anna \\*Rossi\\*\n')
  })
})

describe('cleanResults', () => {
  it('keeps only well-formed entries, without duplicates, up to the limit', () => {
    const raw = [
      { id: 'u1', label: '  Anna   Rossi ', detail: ' Redazione\n' },
      { id: 'u1', label: 'Copia' },
      { id: 'a b', label: 'Spazio' },
      { id: 'u2', label: '' },
      { id: 'u3', label: 42 },
      null,
      'u4',
      { id: 'u5', label: 'Eva', detail: 7 },
      { id: 'u6', label: 'Ugo' },
    ]
    expect(cleanResults(raw, 3)).toEqual([
      { id: 'u1', label: 'Anna Rossi', detail: 'Redazione' },
      { id: 'u5', label: 'Eva' },
      { id: 'u6', label: 'Ugo' },
    ])
    expect(cleanResults({ length: 1, 0: { id: 'x', label: 'X' } }, 5)).toEqual([])
  })
})

describe('mentions', () => {
  it('"@" opens the list, typing searches after a pause, Enter inserts', async () => {
    const { type, key, html, view, calls, listbox, settle } = setup()
    type('Ciao @')
    expect(getMentionState(view.state).active).toBe(true)
    expect(listbox()?.getAttribute('aria-busy')).toBe('true')
    type('br')
    expect(calls).toHaveLength(0) // still typing
    await settle()
    expect(calls.map((c) => c.query)).toEqual(['br'])
    expect(getMentionState(view.state).results.map((r) => r.id)).toEqual(['u2'])
    expect(listbox()?.textContent).toBe('Bruno Bianchi')
    expect(key('Enter')).toBe(true)
    expect(html()).toBe(
      '<p>Ciao <span class="scriba-mention" data-mention-id="u2">@Bruno Bianchi</span> </p>',
    )
    expect(getMentionState(view.state).active).toBe(false)
    expect(view.state.selection.head).toBe(view.state.doc.content.size - 1)
  })

  it('arrows move, Tab chooses; the detail is shown but never inserted', async () => {
    const { type, key, html, listbox, settle } = setup()
    type('@')
    await settle()
    expect(listbox()?.querySelector('.scriba-mention-detail')?.textContent).toBe('Redazione')
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowDown') // wraps around
    key('ArrowUp')
    expect(key('Tab')).toBe(true)
    expect(html()).toBe(
      '<p><span class="scriba-mention" data-mention-id="u3">@Carla Verdi</span> </p>',
    )
  })

  it('a newer query aborts the older search; a late answer is ignored', async () => {
    const pending: { query: string; signal: AbortSignal; resolve: (r: MentionItem[]) => void }[] =
      []
    const { type, view, settle } = setup(
      (query, signal) => new Promise((resolve) => pending.push({ query, signal, resolve })),
    )
    type('@an')
    await settle()
    type('n')
    await settle()
    expect(pending.map((p) => [p.query, p.signal.aborted])).toEqual([
      ['an', true],
      ['ann', false],
    ])
    pending[0]!.resolve([{ id: 'old', label: 'Vecchio' }])
    await settle()
    expect(getMentionState(view.state).results).toEqual([])
    pending[1]!.resolve([PEOPLE[0]!])
    await settle()
    expect(getMentionState(view.state).results.map((r) => r.id)).toEqual(['u1'])
  })

  it('Escape closes, aborts the search and keeps the text', async () => {
    let signal: AbortSignal | undefined
    const { type, key, html, view, settle } = setup((_q, s) => {
      signal = s
      return new Promise(() => {})
    })
    type('@ann')
    await settle()
    expect(key('Escape')).toBe(true)
    expect(signal?.aborted).toBe(true)
    expect(getMentionState(view.state).active).toBe(false)
    expect(html()).toBe('<p>@ann</p>')
  })

  it('errors and timeouts show a message; nothing is inserted', async () => {
    const { type, key, listbox, html, settle } = setup(() => Promise.reject(new Error('down')))
    type('@a')
    await settle()
    expect(listbox()?.parentElement?.textContent).toBe('Ricerca non riuscita')
    expect(key('Enter')).toBe(false)
    expect(html()).toBe('<p>@a</p>')

    const slow = setup(() => new Promise(() => {}))
    slow.type('@b')
    await vi.advanceTimersByTimeAsync(10_200)
    expect(getMentionState(slow.view.state).error).toBe(true)
  })

  it('a search throwing synchronously is an error, not a crash', async () => {
    const { type, view, settle } = setup(() => {
      throw new Error('boom')
    })
    type('@x')
    await settle()
    expect(getMentionState(view.state).error).toBe(true)
  })

  it('hostile results are shown as text and inserted only as a valid node', async () => {
    const { type, key, html, listbox, settle } = setup(() =>
      Promise.resolve([
        { id: '"><img src=x onerror=alert(1)>', label: 'Evil' },
        { id: 'u9', label: '<img src=x onerror=alert(1)>' },
      ] as MentionItem[]),
    )
    type('@e')
    await settle()
    expect(listbox()?.querySelector('img')).toBeNull()
    expect(listbox()?.textContent).toBe('<img src=x onerror=alert(1)>')
    key('Enter')
    expect(html()).toBe(
      '<p><span class="scriba-mention" data-mention-id="u9">@&lt;img src=x onerror=alert(1)&gt;</span> </p>',
    )
  })

  it('does not open inside a word (e-mail) or in code; "@ " is just an at sign', async () => {
    const { type, key, view, html, calls, settle } = setup()
    type('mario@')
    expect(getMentionState(view.state).active).toBe(false)
    type(' @')
    key(' ')
    type(' ok')
    await settle()
    expect(getMentionState(view.state).active).toBe(false)
    expect(calls).toHaveLength(0)
    expect(html()).toBe('<p>mario@ @ ok</p>')

    const code = setup(undefined, '<p><code>x</code></p>')
    code.view.dispatch(
      code.view.state.tr.setSelection(TextSelection.create(code.view.state.doc, 2)),
    )
    code.type('@')
    expect(getMentionState(code.view.state).active).toBe(false)
  })

  it('names with one space keep the list open; no results + space closes it', async () => {
    const { type, key, view, settle } = setup()
    type('@anna ro')
    await settle()
    expect(getMentionState(view.state).active).toBe(true)
    expect(getMentionState(view.state).results.map((r) => r.id)).toEqual(['u1'])
    type('zz')
    await settle()
    expect(getMentionState(view.state).results).toEqual([])
    key(' ')
    type(' ')
    expect(getMentionState(view.state).active).toBe(false)
  })

  it('the mention is deleted as a whole', async () => {
    const { type, key, view, html, settle } = setup()
    type('@car')
    await settle()
    key('Enter')
    const end = view.state.doc.content.size - 1
    // Backspace twice: the space, then the whole mention
    view.dispatch(view.state.tr.delete(end - 1, end))
    view.dispatch(view.state.tr.delete(end - 2, end - 1))
    expect(html()).toBe('<p></p>')
  })

  it('choosing is its own undo step: Ctrl+Z brings "@query" back', async () => {
    const { type, key, html, view, settle } = setup()
    type('Ciao @car')
    await settle()
    key('Enter')
    expect(undo(view.state, (tr) => view.dispatch(tr))).toBe(true)
    expect(html()).toBe('<p>Ciao @car</p>')
  })
})
