import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { taskNodes } from '../../plugins/task/src/nodes.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Tasks: a div with a fixed class and three data attributes of fixed shape; text only inside. */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...taskNodes },
  marks: basicSchemaSpec.marks,
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

interface El {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<El>
  attributes?: ArrayLike<{ name: string; value: string }>
}

const VALUES: Record<string, RegExp> = {
  class: /^scriba-task$/,
  'data-task': /^$/,
  'data-done': /^(true|false)$/,
  'data-due': /^\d{4}-\d{2}-\d{2}$/,
}

function expectSafeTasks(html: string): void {
  const walk = (node: El): void => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i]!
      if (child.nodeType !== 1) continue
      const tag = child.nodeName.toLowerCase()
      if (tag === 'div') {
        for (let j = 0; j < (child.attributes?.length ?? 0); j++) {
          const { name, value } = child.attributes![j]!
          expect(Object.keys(VALUES), `attribute ${name} in ${html}`).toContain(name)
          expect(value, `${name} in ${html}`).toMatch(VALUES[name]!)
        }
        for (let j = 0; j < child.childNodes.length; j++)
          expect(child.childNodes[j]!.nodeType, `markup inside a task: ${html}`).toBe(3)
      } else {
        expect(['p', 'h1', 'h2', 'br', 'strong', 'em', 'u', 's', 'code'], html).toContain(tag)
        for (let j = 0; j < (child.attributes?.length ?? 0); j++)
          expect(child.attributes![j]!.name, html).toBe('never') // no attributes elsewhere
      }
      walk(child)
    }
  }
  walk(dom(html) as unknown as El)
}

const PAYLOADS = [
  '<div data-task data-done="true" onclick="alert(1)" style="background:url(javascript:x)" id="x">Ok</div>',
  '<div data-task data-due="2026-10-20&quot; onmouseover=&quot;alert(1)">Data</div>',
  '<div data-task data-due="javascript:alert(1)"><script>alert(1)</script>Titolo<img src=x onerror=alert(1)></div>',
  '<div data-task>&lt;img src=x onerror=alert(1)&gt;</div>',
  '<div data-task><div data-task>annidato</div></div>',
  `<div data-task>${'x'.repeat(500)}</div>`,
  '<div data-task class="evil" data-done="TRUE">Maiuscolo</div>',
  '<math><mtext><div data-task><mglyph><style><img src=x onerror=alert(1)>',
]

describe('tasks (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expectSafeTasks(out)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('keeps a valid task', () => {
    const task =
      '<div class="scriba-task" data-task="" data-done="true" data-due="2026-10-20">Revisione</div>'
    expect(sanitize(task)).toBe(task)
  })

  it('fuzz: task output is always safe and stable', () => {
    const chunk = fc.constantFrom(
      '<div data-task>',
      '<div data-task data-done="true" data-due="2026-01-31">',
      '<div data-task data-due="2026-02-31">',
      '<div data-task onclick=x>',
      '</div>',
      '<p>',
      '</p>',
      'testo',
      ' ',
      '<b>',
      '<img src=x onerror=y>',
      '<script>',
      '"',
      '<',
    )
    fc.assert(
      fc.property(fc.array(chunk, { maxLength: 30 }), (parts) => {
        const out = sanitize(parts.join(''))
        expectSafeTasks(out)
        expect(sanitize(out)).toBe(out)
      }),
      { numRuns: 300 },
    )
  }, 30_000)
})
