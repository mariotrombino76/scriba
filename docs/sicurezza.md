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
  file aperti, vista sorgente, trascinamento, risposte AI, aggiornamenti della collaborazione.
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

## Upload delle immagini

L'editor non carica niente da solo: chiama la **tua** funzione `upload(file)`. Il controllo del
tipo e della dimensione nel browser è solo un aiuto per l'utente. Sul server:

- verifica il **tipo reale** dai primi byte del file (non dal nome né dal `Content-Type`);
- limita la dimensione; usa un antivirus se serve;
- **rifiuta gli SVG** (possono contenere script) o, se proprio servono, sanificali sul server e
  servili con il `Content-Type` corretto e `Content-Disposition: attachment`;
- servi le immagini da un dominio separato se puoi.

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
