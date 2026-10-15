# CLAUDE.md — Editor di testo rich text (nome provvisorio: **Scriba**)

Questo file guida Claude Code nello sviluppo di un editor WYSIWYG con le funzioni di TinyMCE **e** capacità che TinyMCE non ha (o fa pagare).
Leggilo per intero prima di ogni sessione di lavoro.

---

## 1. Obiettivo del progetto

Costruire un editor rich text:
- **Parità con TinyMCE**: formattazione, liste, tabelle, immagini, link, incolla da Word/Google Docs, undo/redo, codice sorgente HTML, ricerca e sostituzione, schermo intero, i18n, temi, plugin.
- **Superiore a TinyMCE**:
  - modello documento strutturato (schema), non HTML "libero" → output sempre valido e prevedibile;
  - collaborazione in tempo reale (CRDT con Yjs) inclusa, non a pagamento;
  - input Markdown live (`# ` → titolo, `- ` → lista, `**x**` → grassetto);
  - comandi slash (`/tabella`, `/immagine`) e menu "bubble" sulla selezione;
  - export/import JSON, HTML, Markdown;
  - bundle core < 60 KB gzip, tree-shakeable;
  - accessibilità WCAG 2.2 AA dal primo giorno;
  - API TypeScript completamente tipizzata;
  - hook per integrazione AI (suggerimenti, riscrittura) senza dipendere da un fornitore.

**Non-obiettivi (per ora):** impaginazione stile Word con pagine A4, editing di PDF, supporto IE/legacy browser.

---

## 2. Stack e struttura

- **Linguaggio:** TypeScript strict (`"strict": true`, niente `any` non giustificato).
- **Monorepo:** pnpm workspaces.
- **Build:** Vite (library mode) + `tsc` per i `.d.ts`.
- **Test:** Vitest (unità) + Playwright (end-to-end su Chromium, Firefox, WebKit).
- **Lint/format:** ESLint + Prettier.
- **Collaborazione:** Yjs + y-websocket (pacchetto opzionale).
- **Docs/playground:** Nuxt 4 + PrimeVue 4 (coerente con gli altri progetti).

```
/packages
  /core          # modello documento, schema, transazioni, selezione, comandi, plugin API — ZERO dipendenze da framework
  /view          # rendering DOM, gestione contentEditable, eventi beforeinput, IME
  /ui            # toolbar, menu, dialog, bubble menu — Web Components vanilla
  /plugins       # un sotto-pacchetto per plugin: table, image, link, list, code-block, markdown, slash, find-replace, paste-clean, collab…
  /vue           # wrapper Vue 3: <ScribaEditor v-model="..."> + composable useScriba()
  /sanitize-server # sanificazione lato server (Node) con lo stesso schema del core — OBBLIGATORIA per chi salva HTML
  /i18n          # file di traduzione (it, en per primi)
  /themes        # temi CSS (variabili CSS custom)
/apps
  /playground    # app Nuxt per provare tutto a mano
  /docs          # documentazione
/e2e             # test Playwright
```

**Regola d'oro:** `core` non tocca mai il DOM. `view` non conosce i plugin specifici. `ui` parla solo tramite comandi pubblici.

---

## 3. Architettura del core (spiegata semplice)

Pensa all'editor come a una **casa di LEGO**:

1. **Lo schema** è il manuale: dice quali mattoncini esistono (paragrafo, titolo, lista, tabella, immagine) e dove possono stare (una cella sta dentro una riga, una riga dentro una tabella).
2. **Il documento** è la costruzione: un albero di nodi immutabile, sempre conforme allo schema.
3. **Una transazione** è una "mossa": "togli questo mattoncino, metti quest'altro". Il documento vecchio non si rompe: se ne crea uno nuovo. Così undo/redo e collaborazione diventano facili.
4. **La view** è la vetrina: mostra la costruzione nel browser e trasforma i tasti premuti in transazioni.
5. **I plugin** sono kit di espansione: aggiungono mattoncini, mosse e pulsanti senza modificare il resto.

### Concetti tecnici
- **Nodi** (blocchi e inline) e **mark** (grassetto, corsivo, link, colore) separati.
- **Posizioni** intere nel documento (stile ProseMirror) + mappatura delle posizioni attraverso le transazioni.
- **Step** atomici e invertibili (`ReplaceStep`, `AddMarkStep`, `RemoveMarkStep`, `SetAttrsStep`) → base di undo/redo e di Yjs.
- **Comandi**: funzioni pure `(state, dispatch?) => boolean`. Se `dispatch` manca, il comando dice solo *se può* essere eseguito (serve per abilitare/disabilitare pulsanti).
- **Keymap** componibili per plugin, con priorità.
- **Normalizzazione**: dopo ogni transazione il documento viene riportato allo schema (es. tabella senza celle → corretta).

### View
- `contentEditable` controllato: intercettare **`beforeinput`** e tradurre in transazioni; non lasciare che il browser modifichi il DOM da solo.
- Gestire correttamente la **composizione IME** (`compositionstart/end`) — cinese, giapponese, tastiere Android.
- Riconciliazione DOM per nodo (aggiornare solo ciò che è cambiato).
- Selezione sincronizzata DOM ↔ modello in entrambe le direzioni.

---

## 4. Funzionalità — checklist di parità e superamento

### Fase 1 — Fondamenta (MVP)
- [x] Schema base: doc, paragrafo, titoli h1–h6, testo, a capo
- [x] Mark: grassetto, corsivo, sottolineato, barrato, codice inline
- [x] Transazioni, step, undo/redo con raggruppamento temporale
- [x] View con `beforeinput`, selezione, IME
- [x] Toolbar minima + scorciatoie (Ctrl+B/I/U/Z/Y)
- [x] Wrapper Vue con `v-model` (HTML o JSON)
- [x] Serializzazione HTML ↔ documento

### Fase 2 — Parità TinyMCE
- [x] Liste puntate/numerate annidate, Tab/Shift+Tab
- [x] Link (dialog, apertura in nuova scheda, rimozione)
- [x] Immagini: upload con callback, drag&drop, ridimensionamento, testo alternativo, allineamento
- [x] Tabelle: inserimento, unione/divisione celle, righe/colonne, intestazioni, ridimensionamento colonne
- [x] Allineamento testo, rientro, colore testo/sfondo, font e dimensione
- [x] Blocchi citazione e blocchi codice con evidenziazione sintassi
- [x] Incolla pulito da Word / Google Docs / pagine web
- [ ] Vista sorgente HTML
- [ ] Trova e sostituisci (anche regex)
- [x] Schermo intero, conteggio parole/caratteri
- [ ] Caratteri speciali ed emoji
- [x] i18n (it, en) e temi chiaro/scuro

### Fase 3 — Superiore
- [ ] Input rules Markdown + import/export Markdown
- [ ] Comandi slash e bubble menu
- [ ] Collaborazione Yjs con cursori degli altri utenti
- [ ] Commenti e suggerimenti (track changes)
- [ ] Menzioni `@utente` con sorgente dati asincrona
- [ ] API per assistente AI (stream di testo inserito come transazioni annullabili)
- [ ] Modalità sola lettura e permessi per blocco
- [ ] Plugin di esempio Vue (componente Vue renderizzato come nodo)

---

## 5. Sicurezza (non negoziabile)

> In parole semplici: l'editor è come la porta d'ingresso di una casa. Tutto ciò che entra (testo incollato, HTML caricato, messaggi degli altri utenti, risposte dell'AI) è uno **sconosciuto** finché non lo controlliamo. E anche se la porta è sicura, il server deve ricontrollare, perché qualcuno può entrare dalla finestra (inviando HTML direttamente all'API, senza passare dall'editor).

### 5.1 Principio fondamentale
**La sanificazione lato client è una comodità, non una protezione.** Chiunque può inviare HTML arbitrario al backend saltando l'editor. Per questo:
- il pacchetto `/packages/sanitize-server` (Node, senza DOM del browser, basato su `parse5` o equivalente) applica **lo stesso schema** lato server;
- la documentazione deve dire chiaramente agli integratori che l'HTML salvato va **sempre** ripassato da `sanitize-server` prima di essere salvato o mostrato.

### 5.2 Parsing dell'HTML in ingresso
- Tutto l'HTML in ingresso (incolla, `setContent`, import, vista sorgente, drop) passa dal **parser dello schema**: ciò che lo schema non conosce viene scartato.
- Il parsing avviene **solo in un documento inerte**: `new DOMParser().parseFromString(html, 'text/html')` o un elemento `<template>`. **Mai** `innerHTML` su un elemento creato nel documento attivo: un `<img src=x onerror=...>` si attiverebbe prima ancora della sanificazione.
- Vietati nel codice: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout` con stringa. Applicato con ESLint (`eslint-plugin-no-unsanitized` + `no-eval` + `no-implied-eval`). Eccezioni solo con commento `// security-reviewed:` e motivazione.
- L'output HTML è generato dal serializzatore con escape di testo e attributi, mai copiato dal DOM.

### 5.3 URL — whitelist, non blacklist
- Protocolli ammessi per i link: `http:`, `https:`, `mailto:`, `tel:`, URL relativi. Tutto il resto viene rimosso (non solo `javascript:`/`vbscript:`, che si possono offuscare con maiuscole, spazi, entità HTML, caratteri di controllo).
- Normalizzare l'URL prima del controllo (decodifica entità, rimozione di spazi e caratteri di controllo, parsing con `new URL()`).
- Immagini `data:` ammesse solo per `image/png`, `image/jpeg`, `image/gif`, `image/webp`, con limite di dimensione configurabile. **Mai `image/svg+xml`** (un SVG può contenere script).
- Link con `target="_blank"` ricevono sempre `rel="noopener noreferrer"`.

### 5.4 Attributi e stili
- Attributi ammessi definiti per nodo nello schema; tutti gli `on*` e gli attributi sconosciuti vengono scartati.
- Nessun attributo `style` libero: gli stili consentiti (colore, sfondo, allineamento, dimensione font) sono **attributi tipizzati** del nodo/mark, validati con regex rigide (es. colori solo `#rrggbb`, `rgb()`, nomi da lista). Vietati `url()`, `expression()`, `@import`, `var()` provenienti dall'esterno.
- `class` ammesse solo da una whitelist configurabile.
- `id` e `name` prefissati o rimossi per evitare DOM clobbering.

### 5.5 Contenuti incorporati
- `<script>`, `<style>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<base>`, `<meta>`, `<link>` non esistono nello schema e vengono scartati.
- Eventuali embed (video, mappe) solo tramite nodo dedicato con whitelist di domini e `<iframe sandbox>` con il minimo di permessi; mai iframe da HTML incollato.
- L'evidenziatore di sintassi dei blocchi codice deve produrre nodi/decorazioni, non stringhe HTML; se una libreria restituisce HTML, va fatto escape del contenuto prima.

### 5.6 Upload di file
- L'upload è una callback fornita dall'integratore; l'editor non carica nulla da solo.
- Lato client: controllo di tipo MIME e dimensione **solo come aiuto all'utente**. La documentazione deve ricordare che la validazione vera (tipo reale dai magic bytes, dimensione, antivirus se serve) spetta al server.
- SVG caricati: rifiutati di default; se abilitati, vanno sanificati lato server e serviti con `Content-Type` corretto e `Content-Disposition` appropriato.

### 5.7 Compatibilità con CSP e Trusted Types
- L'editor deve funzionare con una CSP rigida: `script-src 'self'` senza `unsafe-inline`/`unsafe-eval`.
- Gli stili dinamici si impostano via CSSOM (`el.style.width = ...`), non con `setAttribute('style', ...)` o tag `<style>` iniettati, così da non richiedere `style-src 'unsafe-inline'`.
- Compatibile con `require-trusted-types-for 'script'`: dove serve inserire markup, usare una policy Trusted Types dedicata e documentata.
- Test e2e eseguiti con CSP rigida attiva nel playground.

### 5.8 Collaborazione in tempo reale (Yjs)
- Gli aggiornamenti in arrivo dagli altri utenti sono **input non fidato**: dopo l'applicazione, il documento va validato contro lo schema; nodi o attributi non validi vengono scartati.
- Il server WebSocket deve autenticare la connessione e verificare i permessi (lettura/scrittura) per ogni documento; nessun documento accessibile solo indovinandone il nome.
- Limiti su dimensione dei messaggi, frequenza e dimensione massima del documento.
- Nomi e colori dei cursori degli altri utenti mostrati come testo, mai come HTML.
- Autore di commenti e suggerimenti assegnato dal server, non dal client (altrimenti chiunque può firmarsi con il nome di un altro).

### 5.9 Integrazione AI
- Il testo generato dall'AI è input non fidato: passa dallo stesso parser dello schema, come un incolla.
- Nessuna chiave API nel codice client: l'editor espone solo hook, la chiamata al modello avviene sul backend dell'integratore.
- Nessun invio di contenuto a servizi esterni senza azione esplicita dell'utente.
- Il contenuto del documento può contenere istruzioni malevole rivolte all'AI (prompt injection): l'AI non deve poter eseguire azioni oltre l'inserimento di testo annullabile.

### 5.10 Negazione del servizio
- Trova e sostituisci con regex: esecuzione con limite di tempo/iterazioni (o in un Web Worker interrompibile) per evitare blocchi da regex catastrofiche.
- Limiti configurabili su profondità di annidamento, dimensione dell'incolla e numero di nodi.
- Il parser non deve mai essere ricorsivo senza limite di profondità.

### 5.11 Test di sicurezza
- Suite dedicata in `/packages/core/test/security` e `/packages/sanitize-server/test`, con payload XSS noti (OWASP XSS Filter Evasion, PortSwigger XSS cheat sheet, mutation XSS).
- Test di **round-trip**: `parse → serialize → parse → serialize` deve dare lo stesso risultato (protegge dalla mutation XSS).
- Fuzzing del parser (es. `fast-check`) con HTML casuale: nessun output deve contenere script, handler o URL non ammessi.
- Ogni vulnerabilità corretta aggiunge un test di regressione.

### 5.12 Dipendenze e pubblicazione
- `pnpm-lock.yaml` sempre committato; installazioni in CI con `--frozen-lockfile`.
- `pnpm audit` in CI; Dependabot/Renovate attivo.
- Nessuno script `postinstall` nelle dipendenze senza revisione.
- Pubblicazione su npm con 2FA e provenance (`npm publish --provenance`).
- File `SECURITY.md` con le istruzioni per segnalare vulnerabilità in privato.

---

## 6. Accessibilità

- Area editabile con `role="textbox"`, `aria-multiline="true"`, etichetta configurabile.
- Toolbar con `role="toolbar"`, navigazione con frecce (roving tabindex), stato `aria-pressed`.
- Dialog con focus trap e ritorno del focus.
- Ogni funzione raggiungibile da tastiera; scorciatoie documentate e mostrate nei tooltip.
- Contrasto colori verificato nei temi.

---

## 7. Prestazioni

- Documenti da 1 MB di testo devono restare fluidi (digitazione < 16 ms per tasto).
- Benchmark in `/packages/core/bench` con Vitest bench; non far peggiorare oltre il 10% senza motivo.
- Plugin caricabili in modo lazy; il core non importa mai plugin.

---

## 8. Convenzioni di codice

- **Lingua:** codice, nomi di API e commenti JSDoc pubblici in **inglese** (libreria distribuibile); documentazione utente e commit in **italiano**.
- **Commit:** Conventional Commits con descrizione in italiano. Es.: `feat(table): aggiunta unione celle`, `fix(view): corretto cursore dopo IME`.
- Funzioni pure dove possibile; stato immutabile nel core.
- Niente classi "dio": un file = una responsabilità, < 400 righe indicative.
- Ogni comando pubblico ha: tipo, test unitario, voce nella documentazione.
- Nel wrapper Vue: Composition API, `<script setup lang="ts">`, composable `useScriba()`, testi tramite i18n (mai stringhe fisse nella UI).
- Nessuna nuova dipendenza runtime nel core senza chiedere prima.

---

## 9. Comandi utili

```bash
pnpm install
pnpm dev            # avvia il playground Nuxt
pnpm build          # build di tutti i pacchetti
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm lint
pnpm bench
pnpm test:security  # suite XSS, round-trip e fuzzing
pnpm audit          # vulnerabilità nelle dipendenze
```

Sviluppo su Windows con WSL: eseguire i comandi dentro WSL per evitare problemi di percorsi e file watcher.

---

## 10. Come deve lavorare Claude

1. **Prima di scrivere codice**, leggi i file coinvolti e questo CLAUDE.md; se la modifica tocca il core, spiega in breve l'impatto su step/transazioni.
2. **Modifiche dirette ai file**, non istruzioni da copiare a mano.
3. **Test insieme al codice**: ogni bug corretto ha un test che lo riproduce; ogni funzione nuova ha test unitari e, se tocca l'input utente, un test Playwright.
4. Esegui `pnpm lint && pnpm test && pnpm test:security` prima di dichiarare un lavoro finito.
   - **Sicurezza prima di tutto:** non disattivare, saltare (`.skip`) o indebolire mai un test o una regola ESLint di sicurezza per far passare la build. Se un test di sicurezza fallisce, il problema è nel codice, non nel test.
   - Ogni modifica a parser, serializzatore, gestione URL, incolla, upload o collaborazione va segnalata esplicitamente nel riepilogo, indicando quali test di sicurezza la coprono.
   - Non aggiungere protocolli, tag o attributi alle whitelist senza chiedere prima.
5. Non rompere l'API pubblica senza segnalarlo; se necessario, aggiorna `CHANGELOG.md`.
6. Quando spieghi un concetto complesso (es. mappatura delle posizioni, CRDT, IME), spiegalo **in modo semplice, come a un bambino**, con un esempio concreto, poi aggiungi il dettaglio tecnico.
7. Lavora per fasi (sezione 4): non iniziare la Fase 2 se la Fase 1 non ha test verdi.
8. In caso di dubbio su una scelta architetturale, proponi 2 opzioni con pro e contro e chiedi.

---

## 11. Riferimenti da studiare (non copiare codice)

- ProseMirror — modello a schema, step, posizioni
- Lexical (Meta) — gestione `beforeinput` e riconciliazione
- Tiptap — API dei plugin/estensioni
- Slate — normalizzazione
- TinyMCE — elenco funzioni e comportamento dell'incolla da Word
- Specifiche W3C: Input Events Level 2, Selection API