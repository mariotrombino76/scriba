**English** · [Italiano](README.it.md)

# @scriba-editor/browser

Scriba in any web page, with no framework and no build step: one stylesheet and one script.

## With a `<script>` tag (CDN)

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.1/dist/scriba.css"
  integrity="sha384-bCFNutcDIpxCiQSC0BSWyqdqJn83GqK1gCHnWU2On4iJI3DFadguiLg7XWQt8Tka"
  crossorigin="anonymous"
/>
<script
  src="https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.1/dist/scriba.iife.js"
  integrity="sha384-sT+cCdJ0Ks8h+R2Lldj9ZjIc4bSobhUeVXZ2FE5tFiEaWAe/W8FVWh2YXcktaDid"
  crossorigin="anonymous"
></script>

<div id="editor"></div>
<script src="/js/editor.js"></script>
```

```js
// /js/editor.js
const editor = Scriba.createEditor('#editor', {
  content: '<p>Hello</p>',
  onChange: (html) => {
    document.querySelector('#hidden-field').value = html
  },
})
```

`/js/editor.js` is not part of Scriba: it is **your own file**, which you create in your site and
serve like any other JavaScript (name and path are up to you). `scriba.iife.js` creates the global
`Scriba` object; your file uses it to mount the editor. It lives in a separate file, and not in a
`<script>` written into the page, because a strict CSP (`script-src 'self'`, without
`unsafe-inline`) blocks inline scripts.

Always put an **exact version** in the URL and keep `integrity` (SRI) and
`crossorigin="anonymous"` on the tags: this way the browser rejects a file that differs from the
expected one. The hashes above are valid only for 0.1.1; for another version, compute them from
the downloaded file:

```bash
curl -sL https://cdn.jsdelivr.net/npm/@scriba-editor/browser@<version>/dist/scriba.iife.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

## As an ES module

```js
import { createEditor } from '@scriba-editor/browser'
import '@scriba-editor/browser/scriba.css'

const editor = createEditor(document.getElementById('editor'), { preset: 'basic' })
```

## Options of `createEditor(target, options)`

`target` is an element or a CSS selector.

| Option          | Default            | Meaning                                                                                                                                                                                                                                                                  |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content`       | empty              | Initial content, HTML or JSON.                                                                                                                                                                                                                                           |
| `format`        | `'html'`           | `'html'` or `'json'` (for `content`, `getContent` and `onChange`).                                                                                                                                                                                                       |
| `preset`        | `'full'`           | `'full'`: headings, lists, links, images, tables, colors and fonts, blockquotes, code, horizontal lines, find and replace, HTML source, fullscreen, Markdown shortcuts, right-click menu. `'basic'`: paragraphs, headings, bold, italic, underline, strikethrough, code. |
| `toolbar`       | `true`             | Shows the toolbar.                                                                                                                                                                                                                                                       |
| `inline`        | `false`            | Inline mode: the text takes the page's styles, the toolbar appears only while typing (Alt+F10 to reach it from the keyboard).                                                                                                                                            |
| `stickyToolbar` | `false`            | The toolbar stays visible at the top of the window while the text scrolls (like TinyMCE's `toolbar_sticky`).                                                                                                                                                             |
| `locale`        | `'it'`             | UI language (`'it'`, `'en'`, `'fr'`, `'de'`, `'es'`) or a messages object.                                                                                                                                                                                               |
| `label`         | "Rich text editor" | Accessible name of the writing area.                                                                                                                                                                                                                                     |
| `editable`      | `true`             | `false`: read-only.                                                                                                                                                                                                                                                      |
| `onChange`      | —                  | Called on every user change, with the content.                                                                                                                                                                                                                           |
| `upload`        | —                  | `full` preset: `async (file) => ({ src })`, uploads the image to **your** server. Without it, images can be inserted only by address.                                                                                                                                    |

Returns `{ view, element, getContent(), setContent(content), setEditable(bool), focus(), destroy() }`.

To build a custom editor, the same file also exposes the building blocks: `Scriba.core`,
`Scriba.view`, `Scriba.ui` and `Scriba.createTranslator`.

## Security

- The content passed to `createEditor`/`setContent`, and the content pasted or dropped, is
  **untrusted input**: it goes through the schema parser in an inert document. No script, `on*`
  attribute or disallowed URL gets into the document.
- The HTML you save must **always** be run again on the server through
  `@scriba-editor/sanitize-server` (Node) before you save or display it: anyone can send HTML to
  your server without going through the editor.
- It works with a strict CSP (`script-src 'self'` plus the CDN origin, no `unsafe-inline` and no
  `unsafe-eval`) and with `require-trusted-types-for 'script'` (policy `scriba`).
- Media (Insert ▸ Media): YouTube in privacy-enhanced mode, Vimeo, Dailymotion, Spotify and
  Google Maps in an `<iframe>` with `sandbox`, or video/audio files from an https address. In the
  editor the services appear as cards; the page that displays the saved HTML must allow them in
  its CSP (`frame-src` for the services, `media-src` for the files).

## Limits of the classic script

- **Regular expression search:** it runs in a Web Worker, which the browser accepts only from the
  same origin as the page. With the classic script, or when loading the files from a CDN, regex
  search answers "not supported" (it never runs on the page's thread, where a catastrophic regex
  could freeze it); plain search always works. To get it, serve the files from your own site and
  use the ES module version (`scriba.js`), next to the `assets/` folder.
- **Sizes:** `scriba.iife.js` ~84 KB gzip (`full` preset included), `scriba.css` ~6 KB gzip. For
  a lighter bundle, use the individual `@scriba-editor/*` packages with your bundler.
