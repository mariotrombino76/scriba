// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { listNodes } from '@scriba-editor/plugin-list'
import { linkMarks } from '@scriba-editor/plugin-link'
import { textStyleMarks, withBlockStyles } from '@scriba-editor/plugin-text-style'
import { cleanPastedDOM, detectSource, type PasteCleanOptions } from '../src/index.js'

const schema = new Schema({
  nodes: withBlockStyles({ ...basicSchemaSpec.nodes, ...listNodes }),
  marks: { ...linkMarks, ...basicSchemaSpec.marks, ...textStyleMarks },
})

function paste(html: string, options?: PasteCleanOptions) {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const source = cleanPastedDOM(body, options)
  return { source, html: serializeHTML(parseHTML(schema, body)) }
}

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta name=Generator content="Microsoft Word 15"><style>p.MsoNormal{margin:0}</style></head>
<body lang=IT><!--StartFragment-->
<p class=MsoTitle><span style='font-size:28.0pt;font-family:"Calibri Light",sans-serif'>Verbale<o:p></o:p></span></p>
<p class=MsoNormal><b><span style='font-size:14.0pt;font-family:"Calibri",sans-serif;color:#C00000'>Importante</span></b><span style='color:windowtext'> testo</span><o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Primo<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Sotto<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span>&nbsp;</span></span></span><![endif]>Secondo<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;&nbsp;</span></span><![endif]>Uno<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp;&nbsp;</span></span><![endif]>Due<o:p></o:p></p>
<!--EndFragment--></body></html>`

const GDOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c"><h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;">Titolo</span></h2><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;">Grassetto</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;"> e </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#1155cc;font-style:italic;">blu</span></p><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;" aria-level="1"><p dir="ltr" role="presentation"><span style="font-size:11pt;">Uno</span></p></li><ul style="margin-top:0;"><li dir="ltr" style="list-style-type:circle;" aria-level="2"><p dir="ltr" role="presentation"><span>Sotto</span></p></li></ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Due</span></p></li></ul><br></b>`

describe('paste-clean', () => {
  it('detects the source', () => {
    const body = (h: string) => new DOMParser().parseFromString(h, 'text/html').body
    expect(detectSource(body(WORD))).toBe('word')
    expect(detectSource(body(GDOCS))).toBe('google-docs')
    expect(detectSource(body('<p>x</p>'))).toBe('other')
  })

  it('cleans Word: real nested lists, titles, no fonts/black/o:p/bullets', () => {
    expect(paste(WORD).html).toBe(
      '<h1>Verbale</h1>' +
        '<p><strong><span style="color: #c00000">Importante</span></strong> testo</p>' +
        '<ul><li><p>Primo</p><ul><li><p>Sotto</p></li></ul></li><li><p>Secondo</p></li></ul>' +
        '<p></p>' +
        '<ol><li><p>Uno</p></li><li><p>Due</p></li></ol>',
    )
  })

  it('cleans Google Docs: no wrapper, nested lists, real formatting only', () => {
    expect(paste(GDOCS).html).toBe(
      '<h2>Titolo</h2>' +
        '<p><strong>Grassetto</strong> e <em><span style="color: #1155cc">blu</span></em></p>' +
        '<ul><li><p>Uno</p><ul><li><p>Sotto</p></li></ul></li><li><p>Due</p></li></ul>',
    )
  })

  it('cleans web pages: no fonts, keeps links and real colors', () => {
    const r = paste(
      '<div><span style="font-family: Roboto; font-size: 14px; color: rgb(32, 33, 36)">Testo</span> <a href="https://x.it" style="color:blue">link</a> <span style="color: rgb(200, 30, 30)">rosso</span></div>',
    )
    expect(r.source).toBe('other')
    expect(r.html).toBe(
      '<p>Testo <a href="https://x.it">link</a> <span style="color: #c81e1e">rosso</span></p>',
    )
  })

  it('options keep fonts or drop colors', () => {
    expect(
      paste('<p><span style="font-size:18pt;color:#c00000">x</span></p>', { keepFonts: true }).html,
    ).toBe('<p><span style="color: #c00000"><span style="font-size: 18pt">x</span></span></p>')
    expect(paste('<p><span style="color:#c00000">x</span></p>', { keepColors: false }).html).toBe(
      '<p>x</p>',
    )
  })

  it('still goes through the schema parser (cleaning is not the security boundary)', () => {
    const r = paste(
      `${WORD.replace('Primo', 'Primo<img src=x onerror=alert(1)><script>alert(1)</script>')}`,
    )
    expect(r.html).not.toMatch(/onerror|script|<img/)
  })
})
