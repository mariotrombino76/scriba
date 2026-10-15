// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  ADD_TO_HISTORY,
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { linkMarks } from '@scriba/plugin-link'
import { parseMarkdown } from '@scriba/plugin-markdown'
import {
  MAX_ANSWER,
  acceptPending,
  aiAssistant,
  discardPending,
  getPending,
  runAi,
  stopAi,
  type AiComplete,
  type AiRequest,
} from '../src/index.js'

const schema = new Schema({
  nodes: basicSchemaSpec.nodes,
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)

/** A fake backend: streams `chunks`, remembers the requests. */
function backend(chunks: string[], opts: { fail?: boolean; wait?: Promise<void> } = {}) {
  const requests: AiRequest[] = []
  const complete: AiComplete = (req) => {
    requests.push(req)
    return (async function* () {
      for (const c of chunks) {
        await (opts.wait ?? Promise.resolve())
        if (opts.fail) throw new Error('backend down')
        yield c
      }
    })()
  }
  return { complete, requests }
}

function setup(html: string, from: number, to = from, complete: AiComplete, markdown = false) {
  const doc = parse(html)
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, from, to),
      plugins: [
        history(),
        ...aiAssistant({
          complete,
          t,
          ...(markdown ? { parse: (text, s) => parseMarkdown(s, text).content } : {}),
        }),
      ],
    }),
  })
  const html2 = () => serializeHTML(view.state.doc)
  const opts = {
    complete,
    t,
    ...(markdown ? { parse: (text: string, s: Schema) => parseMarkdown(s, text).content } : {}),
  }
  return { view, html: html2, opts }
}

describe('AI assistant', () => {
  it('sends only the selected text, streams the answer, Accept makes one undo step', async () => {
    const { complete, requests } = backend(['Ciao ', 'a ', 'tutti'])
    const { view, html, opts } = setup('<p>prima ciao gente dopo</p>', 7, 17, complete)
    await runAi(view, opts, { action: 'improve', mode: 'replace' })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ action: 'improve', text: 'ciao gente' })
    expect(html()).toBe('<p>prima Ciao a tutti dopo</p>')
    expect(getPending(view.state)?.status).toBe('done')
    acceptPending(view)
    expect(getPending(view.state)).toBeNull()
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(html()).toBe('<p>prima ciao gente dopo</p>')
  })

  it('Discard puts the original back, without touching the undo history', async () => {
    const { complete } = backend(['altro'])
    const { view, html, opts } = setup('<p>testo originale</p>', 1, 6, complete)
    await runAi(view, opts, { action: 'improve', mode: 'replace' })
    expect(html()).toBe('<p>altro originale</p>')
    discardPending(view)
    expect(html()).toBe('<p>testo originale</p>')
    expect(undo(view.state)).toBe(false)
  })

  it('"continue" writes at the cursor, sending the text before it', async () => {
    const { complete, requests } = backend([' e poi'])
    const { view, html, opts } = setup('<p>c’era una volta</p>', 16, 16, complete)
    await runAi(view, opts, { action: 'continue', mode: 'cursor' })
    expect(requests[0]!.text).toBe('c’era una volta')
    expect(html()).toBe('<p>c’era una volta e poi</p>')
  })

  it("while an answer is pending your own edits are refused; other users' changes go through", async () => {
    const { complete } = backend(['x'])
    const { view, html, opts } = setup('<p>ab</p>', 1, 2, complete)
    await runAi(view, opts, { action: 'improve', mode: 'replace' })
    view.dispatch(view.state.tr.insertText('Z', 3)) // refused
    expect(html()).toBe('<p>xb</p>')
    view.dispatch(view.state.tr.insertText('R', 3).setMeta(ADD_TO_HISTORY, false)) // remote
    expect(html()).toBe('<p>xbR</p>')
    acceptPending(view)
    expect(html()).toBe('<p>xbR</p>')
  })

  it('Stop keeps what arrived (to accept or discard); errors leave the document intact', async () => {
    let release!: () => void
    const wait = new Promise<void>((r) => (release = r))
    const slow = backend(['uno ', 'due'], { wait })
    const a = setup('<p>x</p>', 2, 2, slow.complete)
    const running = runAi(a.view, a.opts, { action: 'continue', mode: 'cursor' })
    stopAi(a.view)
    release()
    await running
    expect(getPending(a.view.state)?.status).toBe('stopped')
    expect(slow.requests[0]!.signal.aborted).toBe(true)
    const broken = backend(['?'], { fail: true })
    const b = setup('<p>ok</p>', 1, 3, broken.complete)
    await runAi(b.view, b.opts, { action: 'improve', mode: 'replace' })
    expect(getPending(b.view.state)?.status).toBe('error')
    discardPending(b.view)
    expect(b.html()).toBe('<p>ok</p>')
  })

  it('the answer is untrusted: parsed like a paste (no script, no unsafe links)', async () => {
    const { complete } = backend([
      'Ecco **fatto** [qui](javascript:alert(1)) e [sito](https://example.com)\n\n<script>alert(1)</script><img src=x onerror=alert(1)>',
    ])
    const { view, html, opts } = setup('<p>a</p>', 2, 2, complete, true)
    await runAi(view, opts, { action: 'continue', mode: 'cursor' })
    const out = html()
    expect(out).toContain('<strong>fatto</strong>')
    expect(out).toContain('<a href="https://example.com">sito</a>')
    const body = new DOMParser().parseFromString(out, 'text/html').body
    expect(body.querySelector('script, img, [onerror], a[href^="javascript"]')).toBeNull()
  })

  it('a multi-paragraph answer inside a paragraph: accepted as one undo step', async () => {
    const { complete } = backend(['uno\n\ndue'])
    const { view, html, opts } = setup('<p>prima dopo</p>', 7, 7, complete, true)
    await runAi(view, opts, { action: 'continue', mode: 'cursor' })
    expect(html()).toBe('<p>prima uno</p><p>duedopo</p>')
    acceptPending(view)
    expect(html()).toBe('<p>prima uno</p><p>duedopo</p>')
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(html()).toBe('<p>prima dopo</p>')
  })

  it('keeps the spaces at the edges of an inline answer (Markdown trims them)', async () => {
    const { complete } = backend([' e **poi**'])
    const { view, html, opts } = setup('<p>prima</p>', 6, 6, complete, true)
    await runAi(view, opts, { action: 'continue', mode: 'cursor' })
    expect(html()).toBe('<p>prima e <strong>poi</strong></p>')
  })

  it('answers longer than the limit are cut', async () => {
    const { complete } = backend(['x'.repeat(MAX_ANSWER), 'y'.repeat(10)])
    const { view, opts } = setup('<p></p>', 1, 1, complete)
    await runAi(view, opts, { action: 'continue', mode: 'cursor' })
    expect(view.state.doc.textContent.length).toBe(MAX_ANSWER)
  })
})
