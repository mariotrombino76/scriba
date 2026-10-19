import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba/core'
import { listNodes } from '../../plugins/list/src/index.js'
import { textStyleMarks, withBlockStyles } from '../../plugins/text-style/src/index.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/**
 * Superscript/subscript, line height, text direction, list styles (approved 2026-10-19):
 * only the listed tags, values and attributes survive; the rest is dropped.
 */
const schema = new Schema({
  nodes: withBlockStyles({ ...basicSchemaSpec.nodes, ...listNodes }),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))

const PAYLOADS = [
  '<p>H<sub>2</sub>O e x<sup>2</sup> <sup onclick="alert(1)" style="color:url(javascript:x)">n</sup></p>',
  '<p style="line-height: 1.5">a</p><p style="line-height: expression(alert(1))">b</p>',
  '<p style="line-height: url(https://evil.example/x)">c</p><p style="line-height: 150%">d</p>',
  '<p dir="rtl">مرحبا</p><p dir="auto" onmouseover="x">e</p><h2 dir="&quot;onclick=&quot;alert(1)">f</h2>',
  '<ol type="i"><li><p>a</p></li></ol><ol type="javascript:alert(1)"><li><p>b</p></li></ol>',
  '<ol style="list-style-type: upper-roman"><li><p>c</p></li></ol><ul style="list-style-type: circle"><li><p>d</p></li></ul>',
  '<ul style="list-style-type: url(x); behavior: url(x.htc)"><li><p>e</p></li></ul>',
  '<p>10 km&nbsp;e <sup><sub>misto</sub></sup></p>',
]

describe('formatting attributes (server)', () => {
  it('keeps exactly what is allowed', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe('<p>H<sub>2</sub>O e x<sup>2</sup> <sup>n</sup></p>')
    expect(sanitize(PAYLOADS[1]!)).toBe('<p style="line-height: 1.5">a</p><p>b</p>')
    expect(sanitize(PAYLOADS[2]!)).toBe('<p>c</p><p style="line-height: 1.5">d</p>')
    expect(sanitize(PAYLOADS[3]!)).toBe('<p dir="rtl">مرحبا</p><p>e</p><h2>f</h2>')
    expect(sanitize(PAYLOADS[4]!)).toBe(
      '<ol type="i"><li><p>a</p></li></ol><ol><li><p>b</p></li></ol>',
    )
    expect(sanitize(PAYLOADS[5]!)).toBe(
      '<ol type="I"><li><p>c</p></li></ol><ul style="list-style-type: circle"><li><p>d</p></li></ul>',
    )
    expect(sanitize(PAYLOADS[6]!)).toBe('<ul><li><p>e</p></li></ul>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    expect(out).not.toMatch(/on\w+=|javascript:|url\(|expression|behavior|dir="(?!rtl")/i)
    expect(sanitize(out)).toBe(out)
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })
})
