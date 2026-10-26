import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import {
  classMarks,
  textStyleMarks,
  withBlockClasses,
  withBlockStyles,
} from '../../plugins/text-style/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/** Integrator classes (§5.4): only the configured list, one per block or span. */
const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles(basicSchemaSpec.nodes), ['nota-margine', 'avviso']),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...classMarks(['evidenza']) },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<p class="nota-margine">a <span class="evidenza">b</span></p>',
  '<p class="MsoNormal x scriba-page-break">c</p><span class="evidenza onclick">d</span>',
  '<p class="avviso" onclick="alert(1)" id="location" style="background:url(javascript:alert(1))">e</p>',
  '<p class="avviso&quot; onmouseover=&quot;alert(1)">f</p><p class=\'avviso" x="\'>g</p>',
  '<h2 class="  avviso\tnota-margine  ">h</h2><span class="EVIDENZA">i</span>',
  '<svg class="avviso"><p class="avviso">j</p></svg><math><span class="evidenza">k</span></math>',
  '<p class="' + 'x '.repeat(5000) + 'avviso">l</p>',
]

describe('integrator classes (server)', () => {
  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    for (const cls of out.match(/class="[^"]*"/g) ?? [])
      expect(cls).toMatch(/^class="(nota-margine|avviso|evidenza)"$/)
    expect(out).not.toMatch(/on\w+=|javascript:|id=|url\(/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('a schema without the lists drops every class', () => {
    const plain = new Schema(basicSchemaSpec)
    for (const payload of PAYLOADS) expect(sanitizeHTML(plain, payload)).not.toContain('class=')
  })
})
