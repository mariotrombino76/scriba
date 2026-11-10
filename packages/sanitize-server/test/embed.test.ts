import { describe, expect, it } from 'vitest'
import { Schema, basicSchemaSpec, parseHTML, serializeHTML } from '@scriba-editor/core'
import { linkMarks } from '../../plugins/link/src/index.js'
import { embedNodes } from '../../plugins/embed/src/nodes.js'
import { mediaNodes } from '../../plugins/embed/src/media.js'
import { sanitizeHTML } from '../src/index.js'
import { dom } from '../../core/test/helpers/html.js'

/**
 * Embeds (§5.5): an iframe only with the exact player address of an approved
 * service (YouTube privacy-enhanced, Vimeo, Dailymotion, Spotify, Google Maps);
 * src rebuilt, sandbox/referrerpolicy/loading fixed. Video and audio files:
 * src https or relative, controls only.
 */
const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes, ...mediaNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
const sanitize = (html: string) => sanitizeHTML(schema, html)
const inBrowser = (html: string) => serializeHTML(parseHTML(schema, dom(html)))
const plain = (html: string) => sanitizeHTML(new Schema(basicSchemaSpec), html)

const FIXED =
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" loading="lazy"'

const PAYLOADS = [
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="ok"></iframe>',
  '<iframe src="https://player.vimeo.com/video/76979871" sandbox="allow-top-navigation allow-popups allow-forms" allow="camera" allowfullscreen></iframe>',
  '<iframe src="javascript:alert(1)"></iframe><iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe><iframe src="https://evil.example/embed/dQw4w9WgXcQ"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com@evil.example/embed/dQw4w9WgXcQ"></iframe><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" onload="alert(1)" title="&quot; onload=&quot;alert(2)"></iframe>',
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"><img src=x onerror=alert(1)></iframe><p>dopo</p>',
  '<p>a<iframe src="https://player.vimeo.com/video/1" width="1e9" height="-5"></iframe>b</p>',
  '<frame src="https://player.vimeo.com/video/1"><object data="https://player.vimeo.com/video/1"></object><embed src="https://player.vimeo.com/video/1">',
  '<svg><iframe src="https://player.vimeo.com/video/1"></iframe></svg><math><iframe src="https://player.vimeo.com/video/1"></iframe></math>',
  '<noscript><iframe src="https://player.vimeo.com/video/1"></iframe></noscript>',
  '<template><iframe src="https://player.vimeo.com/video/1"></iframe></template>',
  '<iframe src="https://www.dailymotion.com/embed/video/x8abc12" onload="alert(1)"></iframe>',
  '<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" allow="autoplay; clipboard-write; encrypted-media"></iframe>',
  '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2970!2d12.49!3d41.89" style="border:0" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>',
  '<iframe src="https://www.google.com/maps/embed?pb=!1m2%22%3E%3Cscript%3Ealert(1)%3C/script%3E"></iframe>',
  '<iframe src="https://www.google.com.evil.example/maps/embed?pb=!1m18!1m12!1m3"></iframe><iframe src="https://open.spotify.com/embed/artist/4uLU6hMCjMI75M1A2tKUQC"></iframe>',
  '<video src="https://cdn.example/a.mp4" autoplay muted loop poster="javascript:alert(1)" onplay="alert(1)"></video>',
  '<video><source src="javascript:alert(1)"><source src="https://cdn.example/b.webm" onerror="alert(1)"><track src="x.vtt" kind="captions"></video>',
  '<audio src="data:audio/mpeg;base64,AAAA" onplay="alert(1)"></audio><audio src="/a.mp3"><img src=x onerror=alert(1)></audio>',
  '<video src="http://cdn.example/a.mp4"></video><video src="blob:https://x/1"></video><video src="jav&#x09;ascript:alert(1)"></video>',
  '<svg><video src="https://cdn.example/a.mp4"></video></svg><math><audio src="/a.mp3"></audio></math>',
]

describe('embed (server)', () => {
  it('keeps the allowed players, rebuilt with the fixed attributes', () => {
    expect(sanitize(PAYLOADS[0]!)).toBe(
      `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="560" height="315" title="ok" ${FIXED}></iframe>`,
    )
    expect(sanitize(PAYLOADS[1]!)).toBe(
      `<iframe src="https://player.vimeo.com/video/76979871" width="560" height="315" title="Vimeo" ${FIXED}></iframe>`,
    )
    expect(sanitize(PAYLOADS[2]!)).toBe('<p></p>')
    expect(sanitize(PAYLOADS[3]!)).toBe('<p></p>')
    expect(sanitize(PAYLOADS[4]!)).toBe('<p></p>')
  })

  it.each(PAYLOADS.map((p) => [p]))('is safe and stable for %s', (payload) => {
    const out = sanitize(payload)
    // attribute names and tags only: text inside (escaped) attribute values is not markup
    const markup = out.replace(/"[^"]*"/g, '""')
    expect(out).not.toMatch(/javascript:|data:|srcdoc|<script/i)
    expect(markup).not.toMatch(
      /on\w+=|javascript:|data:|srcdoc|allow=|allowfullscreen|<img|<object|<embed|<frame /i,
    )
    for (const iframe of out.match(/<iframe[^>]*>/g) ?? [])
      expect(iframe).toMatch(
        /^<iframe src="https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]{11}|player\.vimeo\.com\/video\/\d+|www\.dailymotion\.com\/embed\/video\/x[a-z0-9]+|open\.spotify\.com\/embed\/(track|album|playlist|episode)\/[A-Za-z0-9]{22}|www\.google\.com\/maps\/embed\?pb=![\w!.~%-]+)" width="\d+" height="\d+" title="[^"<>]*" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" loading="lazy">$/i,
      )
    for (const media of out.match(/<(video|audio)[^>]*>/g) ?? [])
      expect(media).toMatch(/^<(video|audio) src="(https:\/\/[^"]+|\/[^"]+)" controls>$/)
    expect(out).not.toMatch(/autoplay|poster|muted|loop|<source|<track|%3c|%22/i)
    expect(sanitize(out)).toBe(out)
  })

  it('new services and files keep exactly what is allowed', () => {
    expect(
      sanitize(
        '<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" allow="autoplay"></iframe>',
      ),
    ).toBe(
      `<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" width="560" height="152" title="Spotify" ${FIXED}></iframe>`,
    )
    expect(
      sanitize(
        '<iframe src="https://www.google.com/maps/embed?pb=!1m2%22%3E%3Cscript%3E"></iframe>',
      ),
    ).toBe('<p></p>')
    expect(sanitize('<video src="https://cdn.example/a.mp4" autoplay muted></video>')).toBe(
      '<video src="https://cdn.example/a.mp4" controls></video>',
    )
    expect(sanitize('<audio src="data:audio/mpeg;base64,AAAA"></audio>')).toBe('<p></p>')
  })

  it.each(PAYLOADS.map((p) => [p]))('server and browser agree for %s', (payload) => {
    expect(sanitize(payload)).toBe(inBrowser(payload))
  })

  it('a schema without the embed node drops every iframe', () => {
    for (const payload of PAYLOADS) expect(plain(payload)).not.toContain('<iframe')
  })
})
