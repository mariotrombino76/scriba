# Sicurezza

> In parole semplici: l'editor è la porta d'ingresso di una casa. Tutto ciò che entra (testo
> incollato, HTML caricato, messaggi degli altri utenti, risposte dell'AI) è uno sconosciuto
> finché non viene controllato. E anche se la porta è sicura, **il server deve ricontrollare**,
> perché qualcuno può entrare dalla finestra: mandare HTML direttamente alla tua API, senza
> passare dall'editor.

## La regola che non si salta: ripassare l'HTML sul server

La pulizia fatta nel browser è una comodità, non una protezione. Prima di **salvare** o
**mostrare** l'HTML ricevuto da un client, passalo da `@scriba/sanitize-server` con **lo stesso
schema** dell'editor:

```ts
// server Node (Express, Fastify, Nest… è uguale)
import { sanitizeHTML, InputTooLargeError } from '@scriba/sanitize-server'
import { schema } from './schema.js' // lo stesso usato nel browser

app.post('/api/note', (req, res) => {
  try {
    const pulito = sanitizeHTML(schema, String(req.body.html ?? ''))
    salva(pulito)
    res.sendStatus(204)
  } catch (e) {
    if (e instanceof InputTooLargeError) return res.sendStatus(413)
    throw e
  }
})
```

`sanitizeHTML` usa `parse5` (niente DOM, niente esecuzione di codice) e le stesse regole del
browser: ciò che lo schema non conosce viene scartato. Limita anche la dimensione dell'input
(`maxInputLength`, default 5 milioni di caratteri) e l'annidamento.

Se salvi in **JSON**, sul server ricostruisci il documento con `schema.nodeFromJSON(json)`: lancia
un errore per tutto ciò che lo schema rifiuta (tipi, attributi, URL, profondità).

## Cosa fa l'editor

- **Parser dello schema per tutto ciò che entra**: incolla, contenuto iniziale, `setContent`,
  file aperti, vista sorgente, trascinamento, modelli di documento, risposte AI, aggiornamenti
  della collaborazione.
  Il parsing avviene in un **documento inerte** (`DOMParser`): un `<img onerror>` non si attiva
  nemmeno durante l'analisi.
- **Niente `innerHTML`** né `eval` nel codice (imposto da ESLint con regole di sicurezza).
- **URL in whitelist**: link solo `http`, `https`, `mailto`, `tel` e relativi, dopo la
  normalizzazione (entità, spazi, caratteri di controllo). Immagini `data:` solo PNG, JPEG, GIF,
  WebP entro un limite di dimensione; **mai SVG**.
- **Nessuno stile libero**: colori, allineamenti e dimensioni sono attributi tipizzati con
  validatori rigidi; niente `url()`, `expression()`, `@import`, `var()` dall'esterno.
- **Attributi**: solo quelli dichiarati nello schema; tutti gli `on*` scartati; `id` gestiti per
  evitare il DOM clobbering.
- **Link in nuova scheda** con `rel="noopener noreferrer"`.
- **Media**: un `<iframe>` solo per i player dei servizi approvati (YouTube in privacy avanzata,
  Vimeo, Dailymotion, Spotify, Google Maps), sempre con `sandbox`; `<video>`/`<audio>` solo con
  indirizzo https o relativo, mai `autoplay`; nessun altro iframe, mai `srcdoc` (dettagli sotto).
- **Classi**: solo quelle elencate da te (`withBlockClasses`, `classMarks`), formato
  `[a-z][a-z0-9-]*`, mai `scriba-…`; tutte le altre vengono scartate.
- **Id**: solo con prefissi fissi (`anchor-`, `fn-`, `fnref-`) e un nome o numero controllato,
  contro il DOM clobbering.
- **Campi di unione**: `data-merge-tag` solo con un nome `[a-z0-9_.]`; il testo dentro è sempre
  ricostruito dal nome. `fillMergeTags` inserisce i valori come **testo**, mai come HTML.
- **Formule**: dell'HTML in ingresso si legge solo il sorgente LaTeX (l'annotazione
  `application/x-tex`); il MathML viene sempre rigenerato da KaTeX con `trust: false` (niente
  `\href`, `\url`, `\includegraphics`, `\htmlClass`) e limiti contro le macro ricorsive. Il
  MathML in uscita usa solo una whitelist di elementi e attributi: mai `maction`,
  `annotation-xml`, link, classi o stili. Così i noti attacchi di mutation XSS via MathML non
  arrivano mai nel documento.
- **Sezioni comprimibili** (`<details>`): solo l'attributo `open`; `ontoggle` e ogni altro
  attributo vengono scartati.
- **Ricerca con regex** in un Web Worker con limite di tempo: una regex catastrofica non blocca
  la pagina.

## CSP e Trusted Types

Scriba funziona con una Content Security Policy rigida, senza `unsafe-inline` né `unsafe-eval`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:;
object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'
```

- Gli stili dinamici passano dal CSSOM (`el.style.width = …`), mai da attributi `style` o tag
  `<style>` iniettati.
- Con `require-trusted-types-for 'script'`, consenti le policy di Scriba:
  `trusted-types scriba scriba-worker` (la seconda serve al worker della ricerca).
- Caricando lo script da un CDN, aggiungi la sua origine a `script-src` e usa `integrity` (SRI).

I test end-to-end girano tutti con questa CSP attiva.

**Segnalazioni CSP da Chromium.** Per leggere l'HTML che arriva da fuori (incolla, vista
sorgente, `setContent`) Scriba lo apre in un documento inerte. Chromium applica a quel
documento la CSP della pagina: se l'HTML ha attributi `style` o `on…`, li **blocca** e lo
segnala (`style-src-attr`, `script-src-attr`), anche se non sarebbero mai stati usati. Vale
per ogni documento inerte (`DOMParser`, `<template>`, `createHTMLDocument`,
`Document.parseHTMLUnsafe`); Firefox e Safari non lo fanno. Non è un attacco riuscito: è un
attacco (o uno stile di Word) fermato. Se raccogli le segnalazioni con `report-uri` o
`report-to`, aspettati queste voci quando gli utenti incollano da Word o da pagine web. Non
aggiungere `'unsafe-inline'` per farle sparire: Scriba non ne ha bisogno.

**WebKit e `<select>`.** Safari costruisce le parti interne di un `<select>` con stili inline,
che una CSP rigida rifiuta (con un errore in console). Per questo i dialog di Scriba usano
pulsanti radio al posto dei menu a tendina.

### Media incorporati e file video/audio

Con `@scriba/plugin-embed` l'HTML salvato può contenere:

- un `<iframe>`, ma solo con l'indirizzo esatto del player di un servizio approvato: YouTube in
  modalità privacy avanzata (`www.youtube-nocookie.com/embed/…`), Vimeo
  (`player.vimeo.com/video/…`), Dailymotion (`www.dailymotion.com/embed/video/…`), Spotify
  (`open.spotify.com/embed/track|album|playlist|episode/…`) e Google Maps
  (`www.google.com/maps/embed?pb=…`). L'editor ricostruisce sempre l'indirizzo dal riferimento
  controllato e mette lui `sandbox="allow-scripts allow-same-origin allow-presentation"`,
  `referrerpolicy="strict-origin-when-cross-origin"` e `loading="lazy"`: tutto ciò che arriva con
  l'iframe (altri domini, `srcdoc`, `allow`, handler, il suo `sandbox`) viene scartato, anche da
  `sanitize-server`. Nell'editor il player è una scheda: chi scrive non contatta il servizio.
- un `<video controls>` o `<audio controls>` con `src` **https o relativo** (mai `data:`,
  `blob:` o `http:`); `autoplay`, `poster`, `muted`, `loop` e gli altri attributi vengono
  scartati, di un `<source>` si legge solo l'indirizzo. Il file caricato passa dalla **tua**
  funzione `upload`: sul server verifica il tipo reale, la dimensione e il contenuto.

Le pagine che **mostrano** l'HTML salvato devono consentirli nella CSP (`EMBED_FRAME_SRC`
elenca i servizi):

```
frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com https://open.spotify.com https://www.google.com;
media-src 'self' https://il-tuo-cdn.example
```

## Upload delle immagini

L'editor non carica niente da solo: chiama la **tua** funzione `upload(file)`. Il controllo del
tipo e della dimensione nel browser è solo un aiuto per l'utente. Sul server:

- verifica il **tipo reale** dai primi byte del file (non dal nome né dal `Content-Type`);
- limita la dimensione; usa un antivirus se serve;
- **rifiuta gli SVG** (possono contenere script) o, se proprio servono, sanificali sul server e
  servili con il `Content-Type` corretto e `Content-Disposition: attachment`;
- servi le immagini da un dominio separato se puoi.

## Bozze nel browser

`@scriba/plugin-autosave` salva il documento nel `localStorage` **in chiaro**, su quel dispositivo:
attivalo solo dove è accettabile (non su computer condivisi per dati sensibili) e chiama
`clearDraft` dopo il salvataggio e al logout. Una bozza letta dal browser è input non fidato:
rientra solo se `schema.nodeFromJSON` la accetta.

## Collaborazione

Gli aggiornamenti degli altri utenti sono input non fidato: il client li valida contro lo schema
e il server (`@scriba/collab-server`) autentica ogni connessione, controlla i permessi per
documento, limita dimensione e frequenza dei messaggi e assegna **lui** nomi e autori di cursori
e commenti. Dettagli in [Collaborazione](collaborazione.md).

## Assistente AI

- La chiave API resta **sul tuo server**: l'editor chiama solo la tua funzione `complete`.
- Le risposte sono input non fidato: testo dal parser dello schema, blocchi da `nodeFromJSON` più
  una whitelist (niente immagini, link solo se ammessi, niente commenti).
- L'AI può solo **proporre contenuto annullabile**, che l'utente accetta o scarta.
- Il documento può contenere istruzioni malevole rivolte all'AI (prompt injection): trattalo
  come dato nel tuo backend e non dare al modello strumenti che agiscono fuori dall'editor.

Dettagli nella [guida AI](../packages/plugins/ai/README.md).

## Lista di controllo per chi integra

- [ ] HTML (o JSON) ripassato sul server con `sanitize-server` / `nodeFromJSON`, con lo stesso schema.
- [ ] Upload: tipo reale, dimensione, niente SVG.
- [ ] CSP rigida con le policy Trusted Types di Scriba.
- [ ] Collaborazione: `authenticate` che verifica davvero il token e i permessi per documento.
- [ ] AI: chiave solo sul server, limiti di frequenza e dimensione, utenti informati.

Hai trovato una vulnerabilità? Segui [SECURITY.md](../SECURITY.md) (segnalazione privata).
