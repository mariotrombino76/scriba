# Scriba

Editor di testo formattato (WYSIWYG) per il web, scritto in TypeScript. Ha le funzioni di TinyMCE,
comprese quelle che TinyMCE fa pagare. In più, il documento è strutturato e sicuro per
costruzione.

> **Stato:** in preparazione la prima versione pubblica (`0.1.0`). I pacchetti `@scriba/*` non sono
> ancora su npm.

## Perché Scriba

- **Documento con uno schema, non HTML libero.** Ciò che lo schema non conosce viene scartato:
  l'output è sempre valido, prevedibile e privo di script.
- **Sicurezza da integratore.** Parser inerte, URL ammessi solo da una lista (whitelist), funziona
  con una CSP rigida e con Trusted Types. Il pacchetto `@scriba/sanitize-server` riapplica lo stesso
  schema sul server.
- **Collaborazione in tempo reale inclusa** (Yjs), con cursori degli altri, commenti, suggerimenti
  (revisioni) e permessi per blocco.
- **Tutte le funzioni di TinyMCE:**
  - tabelle (unione di celle, ordinamento, ridimensionamento);
  - immagini con ritaglio e rotazione;
  - incolla da Word e Google Docs;
  - trova e sostituisci con regex;
  - vista sorgente e schermo intero;
  - formule (KaTeX) e note a piè di pagina;
  - indice, modelli e campi di unione;
  - pennello formato e verifica dell'accessibilità;
  - cronologia delle versioni, import ed export (HTML, Markdown, Word).
- **Oltre TinyMCE:**
  - scorciatoie Markdown mentre scrivi;
  - comandi `/` e menu sulla selezione;
  - menzioni `@`;
  - un assistente AI che non ti lega a un fornitore (il testo generato si annulla come ogni
    modifica).
- **Accessibile:** punta a WCAG 2.2 AA, verificato in automatico con axe-core. Ogni funzione si usa
  anche da tastiera.
- **Leggero e modulare:** il core pesa circa 25 KB gzip, senza dipendenze, e ogni plugin è un
  pacchetto separato.
- **Dove vuoi:** una pagina qualsiasi (script da CDN), Vue 3, React 18/19, oppure i pacchetti
  montati a mano. Interfaccia in italiano, inglese, francese, tedesco e spagnolo, con tema chiaro e
  scuro.

## In due minuti

**Una pagina qualsiasi** (senza framework né build):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.css" />
<script src="https://cdn.jsdelivr.net/npm/@scriba/browser@0.1.0/dist/scriba.iife.js"></script>
<div id="editor"></div>
<script>
  Scriba.createEditor('#editor', { content: '<p>Ciao</p>', onChange: (html) => salva(html) })
</script>
```

> In un sito con una CSP rigida, sposta lo script in linea in un file `.js`.

**Vue 3:**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ScribaEditor } from '@scriba/vue'
import '@scriba/themes/scriba.css'

const html = ref('<p>Ciao</p>')
</script>

<template>
  <ScribaEditor v-model="html" />
</template>
```

**React:**

```tsx
import { useState } from 'react'
import { ScribaEditor } from '@scriba/react'
import '@scriba/themes/scriba.css'

export function Nota() {
  const [html, setHtml] = useState('<p>Ciao</p>')
  return <ScribaEditor value={html} onChange={(v) => setHtml(v as string)} />
}
```

> **Importante:** sul server ripassa **sempre** l'HTML ricevuto da `sanitizeHTML` di
> `@scriba/sanitize-server` prima di salvarlo o mostrarlo. Chiunque può inviare HTML alla tua API
> senza passare dall'editor. Vedi [Sicurezza](docs/sicurezza.md).

## Pacchetti

| Pacchetto                                             | Cosa fa                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@scriba/core`](packages/core)                       | Schema, documento, transazioni, comandi, undo/redo. Nessun DOM.        |
| [`@scriba/view`](packages/view)                       | La vista nel browser: `contentEditable` controllato, IME, selezione.   |
| [`@scriba/ui`](packages/ui)                           | Barra degli strumenti, menu, finestre di dialogo (Web Components).     |
| [`@scriba/i18n`](packages/i18n)                       | Testi dell'interfaccia: it, en, fr, de, es.                            |
| [`@scriba/themes`](packages/themes)                   | Tema CSS chiaro e scuro, con variabili personalizzabili.               |
| [`@scriba/vue`](packages/vue)                         | `<ScribaEditor v-model>` e `useScriba()` per Vue 3.                    |
| [`@scriba/react`](packages/react)                     | `<ScribaEditor value onChange>` e `useScriba()` per React 18/19.       |
| [`@scriba/browser`](packages/browser)                 | Tutto in un file per qualsiasi pagina: `Scriba.createEditor()`.        |
| [`@scriba/sanitize-server`](packages/sanitize-server) | Sanificazione sul server (Node) con lo stesso schema.                  |
| [`@scriba/collab-server`](packages/collab-server)     | Server WebSocket per la collaborazione: accesso, permessi, limiti.     |
| [`@scriba/plugin-*`](packages/plugins)                | Un pacchetto per funzione: tabelle, immagini, link, AI, commenti, ecc. |

## Documentazione

La documentazione è nella cartella [`docs/`](docs/README.md): [Iniziare](docs/iniziare.md),
[Concetti](docs/concetti.md), [Plugin](docs/plugin.md), [Sicurezza](docs/sicurezza.md),
[Collaborazione](docs/collaborazione.md), [Accessibilità](docs/accessibilita.md),
[Prestazioni](docs/prestazioni.md). Ogni pacchetto ha il suo README con esempi.

## Sviluppo

Requisiti: Node 22 o successivo e pnpm (tramite `corepack`).

```bash
pnpm install
pnpm dev            # playground con tutte le funzioni
pnpm build
pnpm lint && pnpm test && pnpm test:security
pnpm test:e2e       # Playwright: Chromium, Firefox, WebKit
```

Le modifiche sono descritte nel [CHANGELOG](CHANGELOG.md). Per segnalare una vulnerabilità in
privato segui [SECURITY.md](SECURITY.md).

## Licenza

Scriba è rilasciato con la [licenza Apache 2.0](LICENSE). Copyright 2026 **Mario Trombino**.

Puoi usarlo, modificarlo e distribuirlo, anche in prodotti commerciali. La licenza chiede due cose
a chi distribuisce Scriba o un'opera derivata:

- includere il file [LICENSE](LICENSE);
- includere il file [NOTICE](NOTICE) con l'attribuzione a Mario Trombino.

I file distribuiti via CDN riportano la stessa attribuzione in testa.
