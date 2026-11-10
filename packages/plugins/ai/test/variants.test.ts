// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  Schema,
  TextSelection,
  basicSchemaSpec,
  history,
  parseHTML,
  serializeHTML,
  undo,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import {
  MAX_VARIANTS,
  acceptPending,
  aiAssistant,
  getPending,
  runAi,
  selectVariant,
  stopAi,
  variantAiActions,
  type AiComplete,
  type AiRequest,
} from '../src/index.js'

const schema = new Schema({ nodes: basicSchemaSpec.nodes, marks: basicSchemaSpec.marks })
const t = createTranslator('it')

function setup(complete: AiComplete, html = '<p>prima ciao dopo</p>', from = 7, to = 11) {
  const doc = parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, from, to),
      plugins: [history(), ...aiAssistant({ complete, t })],
    }),
  })
  return { view, html: () => serializeHTML(view.state.doc) }
}

describe('several versions', () => {
  it('one request per version; the first is shown; another can be chosen; Accept keeps it', async () => {
    const requests: AiRequest[] = []
    const complete: AiComplete = (req) => {
      requests.push(req)
      return (async function* () {
        yield 'versione '
        yield String((req.variant ?? 0) + 1)
      })()
    }
    const { view, html } = setup(complete)
    await runAi(view, { complete, t }, { action: 'rewrite_variants', mode: 'replace', variants: 3 })
    expect(requests.map((r) => [r.variant, r.variants])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ])
    expect(new Set(requests.map((r) => r.text))).toEqual(new Set(['ciao']))
    const p = getPending(view.state)!
    expect(p.variants).toEqual({
      texts: ['versione 1', 'versione 2', 'versione 3'],
      statuses: ['done', 'done', 'done'],
      selected: 0,
    })
    expect(html()).toBe('<p>prima versione 1 dopo</p>')
    selectVariant(view, 2)
    expect(html()).toBe('<p>prima versione 3 dopo</p>')
    expect(getPending(view.state)!.variants!.selected).toBe(2)
    acceptPending(view)
    expect(html()).toBe('<p>prima versione 3 dopo</p>')
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(html()).toBe('<p>prima ciao dopo</p>')
  })

  it('a version that fails does not stop the others', async () => {
    const complete: AiComplete = async (req) => {
      if (req.variant === 1) throw new Error('backend down')
      return `ok ${req.variant}`
    }
    const { view } = setup(complete)
    await runAi(view, { complete, t }, { action: 'x', mode: 'replace', variants: 3 })
    const p = getPending(view.state)!
    expect(p.status).toBe('done')
    expect(p.variants!.statuses).toEqual(['done', 'error', 'done'])
  })

  it('all failing: an error, the document as it was after Discard', async () => {
    const complete: AiComplete = async () => {
      throw new Error('down')
    }
    const { view } = setup(complete)
    await runAi(view, { complete, t }, { action: 'x', mode: 'replace', variants: 2 })
    expect(getPending(view.state)!.status).toBe('error')
  })

  it('Stop stops every version; versions are capped', async () => {
    let started = 0
    const complete: AiComplete = (req) =>
      (async function* () {
        started++
        yield 'a'
        await new Promise((r) => setTimeout(r, 20))
        if (req.signal.aborted) return
        yield 'b'
      })()
    const { view } = setup(complete)
    const run = runAi(view, { complete, t }, { action: 'x', mode: 'replace', variants: 99 })
    await new Promise((r) => setTimeout(r, 5))
    stopAi(view)
    await run
    expect(started).toBe(MAX_VARIANTS)
    expect(getPending(view.state)!.status).toBe('stopped')
  })

  it('variantAiActions: rewrite and summarize, three versions each', () => {
    expect(variantAiActions().map((a) => [a.id, a.mode, a.variants])).toEqual([
      ['rewrite_variants', 'replace', 3],
      ['summarize_variants', 'after', 3],
    ])
  })
})
