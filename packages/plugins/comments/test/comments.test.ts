// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import {
  addComment,
  commentMarks,
  commentsPanel,
  commentsPlugin,
  createMemoryCommentStore,
  deleteThread,
  focusThread,
  getComments,
  threadRange,
  type CommentStore,
  type CommentThread,
} from '../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...basicSchemaSpec.marks, ...commentMarks },
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(
  html = '<p>uno due tre</p>',
  store: CommentStore = createMemoryCommentStore({ id: 'u1', name: 'Anna' }),
) {
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state: EditorState.create({ doc: parse(html), plugins: [commentsPlugin(store)] }),
  })
  const select = (from: number, to: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  return { view, store, select, html: () => serializeHTML(view.state.doc) }
}

describe('comment anchors', () => {
  it('a comment marks the selected text, follows edits, is not in the exported HTML', async () => {
    const { view, store, select, html } = setup()
    select(5, 8) // "due"
    const thread = await addComment(view, store, 'Da rivedere')
    expect(thread!.comments[0]).toMatchObject({
      text: 'Da rivedere',
      author: { id: 'u1', name: 'Anna' },
    })
    expect(threadRange(view.state.doc, thread!.id)).toEqual({ from: 5, to: 8 })
    view.dispatch(view.state.tr.insertText('>> ', 1))
    expect(threadRange(view.state.doc, thread!.id)).toEqual({ from: 8, to: 11 })
    expect(html()).toBe('<p>&gt;&gt; uno due tre</p>') // no anchor in the HTML
    expect(view.dom.querySelector('.scriba-comment')?.textContent).toBe('due')
  })

  it('pasted HTML can never create comments', () => {
    const doc = parse('<p><span class="scriba-comment-anchor" data-comment="x1">finto</span></p>')
    let found = false
    doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'comment')) found = true
    })
    expect(found).toBe(false)
  })

  it('the range follows edits made while the store answers', async () => {
    let release!: () => void
    const base = createMemoryCommentStore({ id: 'u1', name: 'Anna' })
    const slow: CommentStore = {
      ...base,
      threads: () => base.threads(),
      subscribe: (l) => base.subscribe(l),
      createThread: async (kind, text) => {
        await new Promise<void>((r) => (release = r))
        return base.createThread(kind, text)
      },
    }
    const { view, select } = setup('<p>uno due tre</p>', slow)
    select(5, 8)
    const done = addComment(view, slow, 'nota')
    view.dispatch(view.state.tr.insertText('XX', 1))
    release()
    const thread = await done
    expect(
      view.state.doc.textBetween(
        ...(Object.values(threadRange(view.state.doc, thread!.id)!) as [number, number]),
      ),
    ).toBe('due')
  })

  it('only open threads are highlighted; resolved ones can be reopened; delete removes the anchor', async () => {
    const { view, store, select } = setup()
    select(1, 4)
    const thread = (await addComment(view, store, 'a'))!
    await store.setResolved(thread.id, true)
    expect(view.dom.querySelector('.scriba-comment')).toBeNull()
    await store.setResolved(thread.id, false)
    expect(view.dom.querySelector('.scriba-comment')).not.toBeNull()
    await deleteThread(view, store, thread.id)
    expect(threadRange(view.state.doc, thread.id)).toBeNull()
  })

  it('the cursor in commented text makes its thread active', async () => {
    const { view, store, select } = setup()
    select(5, 8)
    const thread = (await addComment(view, store, 'a'))!
    select(1, 1)
    view.dispatch(view.state.tr.setMeta('x', 1))
    select(6, 6)
    expect(getComments(view.state).active).toBe(thread.id)
    focusThread(view, thread.id)
    expect([view.state.selection.from, view.state.selection.to]).toEqual([5, 8])
  })
})

describe('comments panel', () => {
  it('lists threads with author and text as text; replies keep a draft while others write', async () => {
    const { view, store, select } = setup()
    const container = document.createElement('div')
    document.body.appendChild(container)
    commentsPanel(view, { store, t, container })
    select(1, 4)
    const thread = (await addComment(view, store, '<img src=x onerror=alert(1)> occhio'))!
    await tick()
    const li = container.querySelector(`[data-thread="${thread.id}"]`)!
    expect(li.querySelector('.scriba-comment-text')!.textContent).toBe(
      '<img src=x onerror=alert(1)> occhio',
    )
    expect(li.querySelector('img')).toBeNull()
    expect(li.querySelector('strong')!.textContent).toBe('Anna')
    expect(li.querySelector('.scriba-thread-quote')!.textContent).toBe('“uno”')
    // a draft reply survives an update of another thread
    const area = li.querySelector('textarea')!
    area.value = 'bozza'
    select(5, 8)
    await addComment(view, store, 'altro')
    await tick()
    expect(
      container.querySelector<HTMLTextAreaElement>(`[data-thread="${thread.id}"] textarea`)!.value,
    ).toBe('bozza')
    // replying
    const form = container.querySelector<HTMLFormElement>(`[data-thread="${thread.id}"] form`)!
    form.requestSubmit()
    await tick()
    expect(
      store
        .threads()
        .find((x: CommentThread) => x.id === thread.id)!
        .comments.map((c) => c.text),
    ).toEqual(['<img src=x onerror=alert(1)> occhio', 'bozza'])
  })
})

describe('readers, commenters, editors', () => {
  function roles(role: 'reader' | 'commenter' | 'editor') {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const store = createMemoryCommentStore({ id: 'u1', name: 'Anna' })
    const view = new EditorView(place, {
      state: EditorState.create({
        doc: parse('<p>uno due tre</p>'),
        plugins: [commentsPlugin(store)],
      }),
      editable: () => role === 'editor',
      canAnnotate: () => role === 'commenter',
    })
    const panel = commentsPanel(view, { store, t, container: place })
    return { view, store, place, panel }
  }

  it('the view: commenters get a caret but are read-only; readers get no caret', () => {
    expect(roles('commenter').view.dom.getAttribute('contenteditable')).toBe('true')
    expect(roles('commenter').view.dom.getAttribute('aria-readonly')).toBe('true')
    expect(roles('reader').view.dom.getAttribute('contenteditable')).toBe('false')
  })

  it('commenters add comments (anchor = annotation); readers cannot', async () => {
    const c = roles('commenter')
    c.view.dispatch(c.view.state.tr.setSelection(TextSelection.create(c.view.state.doc, 5, 8)))
    const thread = await addComment(c.view, c.store, 'Ok')
    expect(threadRange(c.view.state.doc, thread!.id)).toEqual({ from: 5, to: 8 })
    // the panel: commenting controls enabled
    await tick()
    expect(c.place.querySelector<HTMLButtonElement>('.scriba-comment-reply button')!.disabled).toBe(
      false,
    )
    const r = roles('reader')
    r.view.dispatch(r.view.state.tr.setSelection(TextSelection.create(r.view.state.doc, 5, 8)))
    const { openCommentDialog } = await import('../src/index.js')
    expect(openCommentDialog(r.view, r.store, t)).toBeNull()
  })

  it('a commenter cannot type: input and text written by the browser are refused', async () => {
    const { view } = roles('commenter')
    const typed = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'x',
      bubbles: true,
      cancelable: true,
    })
    view.dom.querySelector('p')!.dispatchEvent(typed)
    expect(typed.defaultPrevented).toBe(true)
    const text = view.dom.querySelector('p')!.firstChild as Text
    text.data = 'uno due tre!!' // e.g. an IME or a spellchecker
    await tick()
    expect(view.state.doc.textContent).toBe('uno due tre')
    expect(view.dom.querySelector('p')!.textContent).toBe('uno due tre')
  })
})
