// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EditorState,
  NodeSelection,
  Schema,
  TextSelection,
  basicSchemaSpec,
  parseHTML,
  serializeHTML,
} from '@scriba/core'
import { createTranslator } from '@scriba/i18n'
import { EditorView } from '@scriba/view'
import { serializeMarkdown } from '@scriba/plugin-markdown'
import {
  embedNodeView,
  embedNodes,
  insertEmbed,
  embedFromAddress,
  embedFromPlayerUrl,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))

const FIXED =
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" loading="lazy"'
const YT = `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="560" height="315" title="Il video" ${FIXED}></iframe>`

describe('player addresses (HTML)', () => {
  it('only the two players, exactly', () => {
    expect(embedFromPlayerUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
    expect(embedFromPlayerUrl('https://youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
    expect(embedFromPlayerUrl('https://player.vimeo.com/video/76979871')).toEqual({
      provider: 'vimeo',
      ref: '76979871',
    })
  })

  it.each([
    'http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com.evil.example/embed/dQw4w9WgXcQ',
    'https://evil.example/www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com@evil.example/embed/dQw4w9WgXcQ',
    'https://user:pass@www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com:8443/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXc',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ/extra',
    'https://www.youtube-nocookie.com/embed/../../dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9%57gXcQ',
    'https://player.vimeo.com/video/0123',
    'https://player.vimeo.com/video/123abc',
    'https://player.vimeo.com.evil.example/video/123',
    'javascript:alert(1)//https://player.vimeo.com/video/123',
    'data:text/html,<script>alert(1)</script>',
    '//player.vimeo.com/video/123',
    '',
  ])('refuses %s', (src) => {
    expect(embedFromPlayerUrl(src)).toBeNull()
  })
})

describe('addresses typed in the dialog', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtube', 'dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['  https://vimeo.com/76979871  ', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
  ])('%s', (address, provider, id) => {
    expect(embedFromAddress(address)).toEqual({ provider, ref: id })
  })

  it.each([
    'https://www.youtube.com/watch?v=short',
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'https://youtu.be.evil.example/dQw4w9WgXcQ',
    'https://vimeo.com/channels/staffpicks',
    'javascript:alert(1)',
    'ftp://vimeo.com/76979871',
    'una frase qualsiasi',
  ])('refuses %s', (address) => {
    expect(embedFromAddress(address)).toBeNull()
  })
})

describe('embed node', () => {
  it('round trip: the src is rebuilt, the fixed attributes always there', () => {
    expect(html(YT)).toBe(YT)
    expect(html('<iframe src="https://player.vimeo.com/video/76979871"></iframe>')).toBe(
      `<iframe src="https://player.vimeo.com/video/76979871" width="560" height="315" title="Vimeo" ${FIXED}></iframe>`,
    )
  })

  it('drops what came with the iframe: query, handlers, srcdoc, its own sandbox and permissions', () => {
    expect(
      html(
        '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&origin=evil" ' +
          'srcdoc="<script>alert(1)</script>" onload="alert(2)" sandbox="allow-top-navigation allow-popups" ' +
          'allow="camera; microphone" allowfullscreen name="x" id="y" style="position:fixed" ' +
          'referrerpolicy="unsafe-url" loading="eager" width="9999" height="abc" title="Il video">ignored</iframe>',
      ),
    ).toBe(
      `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="1920" height="315" title="Il video" ${FIXED}></iframe>`,
    )
  })

  it('any other iframe is dropped, with its content', () => {
    expect(
      html(
        '<p>a</p><iframe src="https://evil.example/embed/dQw4w9WgXcQ"><p>dentro</p></iframe>' +
          '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>' +
          '<iframe srcdoc="<p>x</p>"></iframe><iframe></iframe><p>b</p>',
      ),
    ).toBe('<p>a</p><p>b</p>')
  })

  it('a title with markup or control characters is plain text', () => {
    const out = html(
      '<iframe src="https://player.vimeo.com/video/1" title="&quot;><script>alert(1)</script>\u0007"></iframe>',
    )
    expect(out).toContain('title="&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62;"')
    expect(out).not.toContain('<script')
  })

  it('an iframe inside a paragraph splits it', () => {
    expect(html(`<p>prima${YT}dopo</p>`)).toBe(`<p>prima</p>${YT}<p>dopo</p>`)
  })

  it('JSON with a bad id or attributes is refused', () => {
    const json = (attrs: Record<string, unknown>) => ({
      type: 'doc',
      content: [{ type: 'embed', attrs: { provider: 'youtube', ref: 'dQw4w9WgXcQ', ...attrs } }],
    })
    expect(() => schema.nodeFromJSON(json({}))).not.toThrow()
    for (const bad of [
      { ref: '../../x' },
      { ref: 'dQw4w9WgXcQ"onload="x' },
      { provider: 'evil' },
      { width: 99999 },
      { height: '315' },
      { title: 'x'.repeat(201) },
      { title: 'a\u0000b' },
    ])
      expect(() => schema.nodeFromJSON(json(bad))).toThrow()
  })

  it('exports as the address of the video page', () => {
    expect(serializeMarkdown(parse(YT))).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('insertEmbed', () => {
  it('in an empty paragraph: replaces it, the cursor goes below', () => {
    const doc = parse('<p></p>')
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
    const ok = insertEmbed({ provider: 'vimeo', ref: '76979871', title: 'T' })(
      state,
      (tr) => (state = state.apply(tr)),
    )
    expect(ok).toBe(true)
    expect(serializeHTML(state.doc)).toMatch(
      /^<iframe src="https:\/\/player.vimeo.com\/video\/76979871"[^>]*><\/iframe><p><\/p>$/,
    )
    expect(state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('a selected video is changed in place; bad attributes are refused', () => {
    const doc = parse(YT)
    let state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) })
    insertEmbed({
      provider: 'youtube',
      ref: 'aaaaaaaaaaa',
      title: 'Nuovo',
      width: 640,
      height: 360,
    })(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toContain(
      'embed/aaaaaaaaaaa" width="640" height="360" title="Nuovo"',
    )
    expect(insertEmbed({ provider: 'youtube', ref: 'no' })(state)).toBe(false)
  })
})

describe('embedNodeView', () => {
  it('a card in the editor, never the player', () => {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ schema, doc: parse(YT) }),
      nodeViews: { embed: embedNodeView(t) },
    })
    const card = place.querySelector<HTMLElement>('.scriba-embed')!
    expect(place.querySelector('iframe')).toBeNull()
    expect(card.getAttribute('aria-label')).toBe('Video: Il video')
    expect(card.textContent).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(card.style.aspectRatio).toBe('560 / 315')
    view.destroy()
  })
})
