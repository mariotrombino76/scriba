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
import {
  embedFromAddress,
  embedFromPlayerUrl,
  embedNodes,
  insertMediaFile,
  mediaFileNodeView,
  mediaKindOf,
  mediaKindOfType,
  mediaNodes,
  safeMediaUrl,
} from '../src/index.js'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes, ...mediaNodes },
  marks: basicSchemaSpec.marks,
})
const t = createTranslator('it')
const parse = (html: string) =>
  parseHTML(schema, new DOMParser().parseFromString(html, 'text/html').body)
const html = (input: string) => serializeHTML(parse(input))
const FIXED =
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" loading="lazy"'

const SPOTIFY = 'track/4uLU6hMCjMI75M1A2tKUQC'
const PB =
  '!1m18!1m12!1m3!1d2970.0!2d12.4922!3d41.8902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x132f61b6532013ad%3A0x28f1c82e908503c4!2sColosseo!5e0!3m2!1sit!2sit!4v1700000000000'

describe('new services: Dailymotion, Spotify, Google Maps', () => {
  it('exact player addresses', () => {
    expect(embedFromPlayerUrl('https://www.dailymotion.com/embed/video/x8abc12')).toEqual({
      provider: 'dailymotion',
      ref: 'x8abc12',
    })
    expect(embedFromPlayerUrl(`https://open.spotify.com/embed/${SPOTIFY}`)).toEqual({
      provider: 'spotify',
      ref: SPOTIFY,
    })
    expect(embedFromPlayerUrl(`https://www.google.com/maps/embed?pb=${PB}`)).toEqual({
      provider: 'maps',
      ref: PB,
    })
  })

  it.each([
    'https://www.dailymotion.com.evil.example/embed/video/x8abc12',
    'https://www.dailymotion.com/embed/video/../x8abc12',
    'https://open.spotify.com/embed/artist/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/embed/track/short',
    'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC/extra',
    'https://www.google.com/maps/embed?pb=x&other=1',
    'https://www.google.com/maps/embed?pb=!1m2"onload="alert(1)',
    'https://www.google.com/maps/embed?pb=!1m2<script>alert(1)</script>',
    'https://www.google.com/maps/embed?pb=!1m2%22%3E%3Cscript%3E',
    'https://www.google.com/maps/place/Colosseo',
    'https://maps.google.com/maps/embed?pb=!1m18!1m12!1m3',
    'https://www.google.com.evil.example/maps/embed?pb=!1m18!1m12!1m3',
    'https://www.google.com/search?pb=!1m18!1m12!1m3',
  ])('refuses %s', (src) => {
    expect(embedFromPlayerUrl(src)).toBeNull()
  })

  it('usual links and whole embed codes in the dialog', () => {
    expect(embedFromAddress('https://www.dailymotion.com/video/x8abc12')?.ref).toBe('x8abc12')
    expect(embedFromAddress('https://dai.ly/x8abc12')?.ref).toBe('x8abc12')
    expect(embedFromAddress('https://geo.dailymotion.com/player.html?video=x8abc12')?.ref).toBe(
      'x8abc12',
    )
    expect(
      embedFromAddress('https://open.spotify.com/intl-it/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'),
    ).toEqual({ provider: 'spotify', ref: SPOTIFY })
    // Google Maps "Share ▸ Embed a map": the whole code, only its src is read
    expect(
      embedFromAddress(
        `<iframe src="https://www.google.com/maps/embed?pb=${PB}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`,
      ),
    ).toEqual({ provider: 'maps', ref: PB })
    expect(embedFromAddress('<iframe src="https://evil.example/x"></iframe>')).toBeNull()
    expect(embedFromAddress('<img src=x onerror=alert(1)>')).toBeNull()
  })

  it('JSON: a map reference with encoded markup is refused', () => {
    const json = (ref: string) => ({
      type: 'doc',
      content: [{ type: 'embed', attrs: { provider: 'maps', ref } }],
    })
    expect(() => schema.nodeFromJSON(json(PB))).not.toThrow()
    expect(() => schema.nodeFromJSON(json('!1m2%3Cscript%3Ealert(1)'))).toThrow()
    expect(() => schema.nodeFromJSON(json('!1m2%22onload%3D'))).toThrow()
  })

  it('round trip with the service default size; a map', () => {
    expect(html(`<iframe src="https://open.spotify.com/embed/${SPOTIFY}"></iframe>`)).toBe(
      `<iframe src="https://open.spotify.com/embed/${SPOTIFY}" width="560" height="152" title="Spotify" ${FIXED}></iframe>`,
    )
    const map = html(
      `<iframe src="https://www.google.com/maps/embed?pb=${PB}" allowfullscreen></iframe>`,
    )
    expect(map).toBe(
      `<iframe src="https://www.google.com/maps/embed?pb=${PB}" width="600" height="450" title="Google Maps" ${FIXED}></iframe>`,
    )
    expect(html(map)).toBe(map)
  })
})

describe('video and audio files', () => {
  it('kinds from extension and MIME type', () => {
    expect(mediaKindOf('https://cdn.example/film.MP4?x=1#t=3')).toBe('video')
    expect(mediaKindOf('/media/brano.mp3')).toBe('audio')
    expect(mediaKindOf('https://example.com/pagina.html')).toBeNull()
    expect(mediaKindOfType('video/webm')).toBe('video')
    expect(mediaKindOfType('audio/mpeg')).toBe('audio')
    expect(mediaKindOfType('image/svg+xml')).toBeNull()
  })

  it.each([
    ['https://cdn.example/a.mp4', 'https://cdn.example/a.mp4'],
    ['/media/a.mp3', '/media/a.mp3'],
    ['a.webm', 'a.webm'],
    ['http://cdn.example/a.mp4', null],
    ['data:video/mp4;base64,AAAA', null],
    ['blob:https://example.com/123', null],
    ['javascript:alert(1)//a.mp4', null],
    ['jav&#x09;ascript:alert(1)', null],
    ['ftp://x/a.mp4', null],
  ])('address %s', (input, expected) => {
    expect(safeMediaUrl(input)).toBe(expected)
  })

  it('round trip: only src and controls are kept', () => {
    expect(
      html(
        '<video src="https://cdn.example/a.mp4" autoplay loop muted poster="https://x/p.jpg" onplay="alert(1)" width="9" class="x" id="y" crossorigin="anonymous"><track src="s.vtt"></video>',
      ),
    ).toBe('<video src="https://cdn.example/a.mp4" controls></video>')
    expect(html('<audio controls src="/a.mp3"></audio>')).toBe(
      '<audio src="/a.mp3" controls></audio>',
    )
    const out = html('<video src="https://cdn.example/a.mp4"></video>')
    expect(html(out)).toBe(out)
  })

  it('a <source> is read for its address only; unsafe ones are skipped', () => {
    expect(
      html(
        '<video><source src="javascript:alert(1)"><source src="data:video/mp4;base64,AA"><source src="https://cdn.example/b.webm" type="video/webm" onerror="alert(1)"></video>',
      ),
    ).toBe('<video src="https://cdn.example/b.webm" controls></video>')
  })

  it('no valid address: dropped, with its content', () => {
    expect(
      html('<p>a</p><video src="http://x/a.mp4"><p>fallback</p></video><audio></audio><p>b</p>'),
    ).toBe('<p>a</p><p>b</p>')
  })

  it('JSON with an unsafe address is refused', () => {
    const json = (src: string) => ({
      type: 'doc',
      content: [{ type: 'video_file', attrs: { src } }],
    })
    expect(() => schema.nodeFromJSON(json('https://cdn.example/a.mp4'))).not.toThrow()
    for (const bad of [
      'javascript:alert(1)',
      'http://x/a.mp4',
      'data:video/mp4;base64,AA',
      ' https://x ',
    ])
      expect(() => schema.nodeFromJSON(json(bad))).toThrow()
  })

  it('insertMediaFile: at the cursor, or in place of the selected media', () => {
    const doc = parse('<p></p>')
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) })
    expect(insertMediaFile('audio', '/a.mp3')(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(serializeHTML(state.doc)).toBe('<audio src="/a.mp3" controls></audio><p></p>')
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))
    insertMediaFile('video', '/b.mp4')(state, (tr) => (state = state.apply(tr)))
    expect(serializeHTML(state.doc)).toBe('<video src="/b.mp4" controls></video><p></p>')
    expect(insertMediaFile('video', 'javascript:alert(1)')(state)).toBe(false)
  })

  it('the editor shows the real player and leaves its controls to the browser', () => {
    const place = document.createElement('div')
    document.body.appendChild(place)
    const view = new EditorView(place, {
      state: EditorState.create({ schema, doc: parse('<video src="/a.mp4"></video><p>x</p>') }),
      nodeViews: { video_file: mediaFileNodeView(t), audio_file: mediaFileNodeView(t) },
    })
    const video = place.querySelector('video')!
    expect(video.controls).toBe(true)
    expect(video.getAttribute('src')).toBe('/a.mp4')
    expect(video.getAttribute('aria-label')).toBe('Video')
    expect(place.querySelector('.scriba-media-file')!.getAttribute('contenteditable')).toBe('false')
    view.destroy()
  })
})
