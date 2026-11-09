# @scriba/browser

Scriba in qualsiasi pagina web, senza framework e senza build: un foglio di stile e uno script.

## Con un tag `<script>` (CDN)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.css" />
<script src="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.iife.js"></script>

<div id="editor"></div>
<script src="/js/editor.js"></script>
```

```js
// /js/editor.js
const editor = Scriba.createEditor('#editor', {
  content: '<p>Ciao</p>',
  onChange: (html) => {
    document.querySelector('#campo-nascosto').value = html
  },
})
```

Indica sempre una **versione esatta** nell'URL e, se puoi, aggiungi `integrity` (SRI) e
`crossorigin="anonymous"` ai tag: così il browser rifiuta un file diverso da quello atteso.

## Come modulo ES

```js
import { createEditor } from '@scriba/browser'
import '@scriba/browser/scriba.css'

const editor = createEditor(document.getElementById('editor'), { preset: 'basic' })
```

## Opzioni di `createEditor(destinazione, opzioni)`

`destinazione` è un elemento o un selettore CSS.

| Opzione    | Default                      | Significato                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content`  | vuoto                        | Contenuto iniziale, HTML o JSON.                                                                                                                                                                                                                                               |
| `format`   | `'html'`                     | `'html'` o `'json'` (per `content`, `getContent` e `onChange`).                                                                                                                                                                                                                |
| `preset`   | `'full'`                     | `'full'`: titoli, elenchi, link, immagini, tabelle, colori e font, citazioni, codice, linee, trova e sostituisci, sorgente HTML, schermo intero, scorciatoie Markdown, menu del tasto destro. `'basic'`: paragrafi, titoli, grassetto, corsivo, sottolineato, barrato, codice. |
| `toolbar`  | `true`                       | Mostra la barra degli strumenti.                                                                                                                                                                                                                                               |
| `inline`   | `false`                      | Modalità inline: il testo prende gli stili della pagina, la barra compare solo durante la scrittura (Alt+F10 per raggiungerla da tastiera).                                                                                                                                    |
| `locale`   | `'it'`                       | Lingua dell'interfaccia (`'it'`, `'en'`, `'fr'`, `'de'`, `'es'`) o un oggetto di messaggi.                                                                                                                                                                                     |
| `label`    | "Editor di testo formattato" | Nome accessibile dell'area di scrittura.                                                                                                                                                                                                                                       |
| `editable` | `true`                       | `false`: sola lettura.                                                                                                                                                                                                                                                         |
| `onChange` | —                            | Chiamata a ogni modifica dell'utente, con il contenuto.                                                                                                                                                                                                                        |
| `upload`   | —                            | Preset `full`: `async (file) => ({ src })`, carica l'immagine sul **tuo** server. Senza, le immagini si inseriscono solo per indirizzo.                                                                                                                                        |

Restituisce `{ view, element, getContent(), setContent(contenuto), setEditable(bool), focus(), destroy() }`.

Per comporre un editor su misura, lo stesso file espone anche i mattoni: `Scriba.core`,
`Scriba.view`, `Scriba.ui` e `Scriba.createTranslator`.

## Sicurezza

- Il contenuto passato a `createEditor`/`setContent`, e quello incollato o trascinato, è
  **input non fidato**: passa dal parser dello schema in un documento inerte. Nessuno script,
  attributo `on*` o URL non ammesso entra nel documento.
- L'HTML che salvi va **sempre** ripassato sul server da `@scriba/sanitize-server` (Node) prima
  di salvarlo o mostrarlo: chiunque può inviare HTML al tuo server senza passare dall'editor.
- Funziona con una CSP rigida (`script-src 'self'` più l'origine del CDN, niente
  `unsafe-inline` né `unsafe-eval`) e con `require-trusted-types-for 'script'` (policy `scriba`).
- Media (Inserisci ▸ Media): YouTube in modalità privacy avanzata, Vimeo, Dailymotion, Spotify e
  Google Maps in un `<iframe>` con `sandbox`, oppure file video/audio da un indirizzo https. Nell'editor
  i servizi appaiono come schede; la pagina che mostra l'HTML salvato deve consentirli nella CSP
  (`frame-src` per i servizi, `media-src` per i file).

## Limiti dello script classico

- **Ricerca con espressioni regolari:** gira in un Web Worker, che il browser accetta solo dalla
  stessa origine della pagina. Con lo script classico, o caricando i file da un CDN, la ricerca
  con regex risponde "non supportata" (non viene mai eseguita sul thread della pagina, dove una
  regex catastrofica potrebbe bloccarla); la ricerca normale funziona sempre. Per averla,
  servi i file dal tuo sito e usa la versione modulo ES (`scriba.js`), accanto alla cartella
  `assets/`.
- **Pesi:** `scriba.iife.js` ~84 KB gzip (preset `full` compreso), `scriba.css` ~6 KB gzip.
  Per un pacchetto più leggero usa i singoli pacchetti `@scriba/*` con il tuo bundler.
