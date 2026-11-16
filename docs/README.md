# Documentazione di Scriba

Scriba è un editor di testo formattato (WYSIWYG) per il web: le funzioni di TinyMCE più un
documento strutturato e sicuro per costruzione, collaborazione in tempo reale, scorciatoie
Markdown, comandi "/", commenti, menzioni e un assistente AI senza fornitore obbligato.

## In due minuti

**Una pagina qualsiasi** (nessun framework, nessuna build):

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
<!-- /js/editor.js: Scriba.createEditor('#editor', { onChange: (html) => salva(html) }) -->
```

`/js/editor.js` è un file tuo (non di Scriba), separato dalla pagina per funzionare con una CSP
rigida: vedi [Iniziare](iniziare.md#pagina-qualsiasi-script-da-cdn).

**Vue 3:** `<ScribaEditor v-model="html" />` · **React:** `<ScribaEditor value={html} onChange={setHtml} />`

Poi, sul server, **ripassa sempre l'HTML** da `sanitizeHTML` di `@scriba-editor/sanitize-server` prima di
salvarlo o mostrarlo: vedi [Sicurezza](sicurezza.md).

## Guide

| Guida                               | Contenuto                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| [Iniziare](iniziare.md)             | Installazione nei vari ambienti, tema, lingua, contenuto HTML o JSON.               |
| [Concetti](concetti.md)             | Schema, documento, transazioni, comandi, plugin: come funziona, in parole semplici. |
| [Plugin](plugin.md)                 | Tutti i plugin, a cosa servono e come si collegano a toolbar e tastiera.            |
| [Sicurezza](sicurezza.md)           | Cosa protegge l'editor, cosa spetta al tuo server, CSP, upload, link.               |
| [Collaborazione](collaborazione.md) | Più persone sullo stesso documento: client e server.                                |
| [Accessibilità](accessibilita.md)   | Tastiera, lettori di schermo, scorciatoie.                                          |
| [Prestazioni](prestazioni.md)       | Documenti grandi, benchmark e peso dei pacchetti.                                   |

Guide dei singoli pacchetti:

- [Assistente AI](../packages/plugins/ai/README.md) — configurazione, backend, blocchi generati,
  più versioni tra cui scegliere.
- [React](../packages/react/README.md) — `<ScribaEditor>` e `useScriba()`.
- [Script da CDN](../packages/browser/README.md) — `Scriba.createEditor` senza build.

Per chi sviluppa Scriba: [CHANGELOG](../CHANGELOG.md), [rilasci](../RELEASING.md),
[segnalare una vulnerabilità](../SECURITY.md). Il playground è la demo: `pnpm dev`.
