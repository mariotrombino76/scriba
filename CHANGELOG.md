# Changelog

Tutte le modifiche rilevanti di Scriba sono riportate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto
adotta il [Versionamento Semantico](https://semver.org/lang/it/). Finché i pacchetti restano
alla versione `0.x`, l'API pubblica può cambiare anche tra versioni minori: ogni modifica
incompatibile è comunque segnalata qui nella sezione **Modificato**, con l'indicazione
**incompatibile**.

Tutti i pacchetti `@scriba/*` sono ancora alla versione `0.0.0` e non sono stati pubblicati.

## Non rilasciato

### Aggiunto

#### Fondamenta (Fase 1)

- `@scriba/core`
  - Schema con espressioni di contenuto, nodi e mark immutabili, posizioni intere, `Slice` e
    algoritmo di replace validato dallo schema.
  - Step invertibili: `ReplaceStep`, `ReplaceAroundStep`, `AddMarkStep`, `RemoveMarkStep`,
    `SetAttrsStep`, cambio di tipo del nodo. Mapping delle posizioni e `Transform`.
  - `EditorState`, `Transaction`, selezioni (testo, nodo), plugin, comandi
    `(state, dispatch?, view?) => boolean`, keymap senza DOM con priorità.
  - Cronologia (undo/redo) con raggruppamento temporale.
  - Parser HTML su interfaccia `DOMLike` e serializzatore con escape di testo e attributi.
  - Stili tipizzati: whitelist di proprietà con validatori rigidi, helper `withStyle`.
  - `insertContent`: adatta il contenuto incollato al punto di inserimento.
  - Opzione `serialize: false` per i mark: visibili nell'editor, esclusi dall'HTML.
- `@scriba/view`
  - `contentEditable` controllato via `beforeinput`, riconciliazione per nodo, selezione
    sincronizzata in entrambe le direzioni, composizione IME.
  - Appunti sanificati; incolla come testo semplice con Ctrl/Cmd+Maiusc+V.
  - Decorazioni inline (solo visive: non salvate, non annullabili, non condivise).
  - Viste dei nodi dei plugin; `posAtCoords`, `coordsAtPos`, `subscribe()`.
  - Hook: `transformPastedDOM`, `handleDrop`, `handlePasteFiles`, `handlePasteContent`,
    `handleDoubleClickNode`, `handleTextInput`.
- `@scriba/sanitize-server`: stesso schema del core lato server (Node, `parse5`).
- `@scriba/ui`
  - `<scriba-toolbar>` Web Component senza Shadow DOM, pattern WAI-ARIA toolbar.
  - Gruppi con nome, menu che mostrano il valore attuale, sottomenu e "Altre opzioni" quando
    lo spazio non basta, voci `menuitemcheckbox`, icone SVG.
  - Dialog generico con focus trap e ritorno del focus.
  - API `toolbarGroup`, `historyItems`, `markItems`, `blockStyleMenu`.
- `@scriba/vue`: `<ScribaEditor v-model>` (HTML o JSON) e composable `useScriba()`.
- `@scriba/i18n`: messaggi tipizzati in italiano e inglese, con fallback e override.
- `@scriba/themes`: `scriba.css` con variabili CSS, temi chiaro e scuro, contrasti WCAG
  verificati da test.

#### Parità TinyMCE (Fase 2)

- `@scriba/plugin-list`: elenchi puntati e numerati annidati, Tab/Maiusc+Tab, Ctrl+Maiusc+8/7.
- `@scriba/plugin-blockquote`: citazioni.
- `@scriba/plugin-link`: mark link con whitelist URL, dialog accessibile, Ctrl+K.
- `@scriba/plugin-text-style`: allineamento, rientro, colore del testo, evidenziazione,
  carattere e dimensione.
- `@scriba/plugin-code-block`: blocchi di codice con evidenziazione sintassi (`lowlight`
  trasformato in decorazioni) e scelta del linguaggio.
- `@scriba/plugin-paste-clean`: incolla pulito da Word, Google Docs e pagine web.
- `@scriba/plugin-image`: immagini con file picker, trascinamento, incolla, ridimensionamento,
  testo alternativo e allineamento. L'upload è una callback dell'integratore.
- `@scriba/plugin-table`: tabelle con selezione di celle, unione e divisione, righe e colonne
  di intestazione, ridimensionamento colonne, didascalia, proprietà di tabella e celle,
  griglia di inserimento, copia e incolla di celle.
- `@scriba/plugin-word-count`: conteggio parole e caratteri con `Intl.Segmenter`.
- `@scriba/plugin-fullscreen`: schermo intero (Ctrl+Maiusc+F).
- `@scriba/plugin-source`: vista e modifica del sorgente HTML.
- `@scriba/plugin-find-replace`: trova e sostituisci, anche con regex.
- `@scriba/plugin-charmap`: caratteri speciali ed emoji con ricerca in italiano e inglese.

#### Oltre TinyMCE (Fase 3)

- `@scriba/plugin-markdown`: scorciatoie Markdown durante la digitazione, `serializeMarkdown`
  (CommonMark + tabelle GFM), `parseMarkdown` e `markdownToHTML`.
- `@scriba/plugin-slash`: comandi slash con elenco filtrabile e combobox accessibile.
- `@scriba/plugin-bubble`: toolbar compatta sopra il testo selezionato (Alt+F10).
- `@scriba/plugin-collab`
  - `yBinding({ ydoc })`: sincronizzazione documento ↔ Yjs.
  - `collabCursors`: cursori e selezioni degli altri utenti.
  - `CollabProvider` e `collab({ url, documentName, token, user })`: trasporto WebSocket con
    riconnessione e stato osservabile; `collabStatusElement`.
  - `collabCommentStore(provider)`: commenti condivisi tramite il server.
- `@scriba/collab-server`: server di collaborazione compatibile con `y-websocket`, con
  autenticazione, permessi per documento, limiti e persistenza (`attachCollabServer`,
  `listenCollabServer`, `documentFromYjs`).
- `@scriba/plugin-ai`: `aiAssistant({ complete, parse, t, actions })`, risposte in streaming
  con Accetta (un solo passo di annulla), Scarta, Stop e Riprova.
- `@scriba/plugin-comments`
  - Commenti con discussioni, risposte, risolvi/riapri e pannello laterale (Ctrl/Cmd+Alt+M).
  - `CommentStore` e `createMemoryCommentStore`.
  - Modifiche proposte (track changes): `suggestionMarks`, `suggestionsPlugin`,
    `resolveSuggestion`, `resolveAllSuggestions`.
- `@scriba/plugin-mention`: menzioni `@persona` con sorgente dati asincrona.
  - Nodo `mention` (`mentionNodes`) inline e atomico, con `id` e `label`; in HTML
    `<span class="scriba-mention" data-mention-id="…">@Nome</span>`, in Markdown `@Nome`.
  - `mentions({ search, t, debounce, maxResults, timeout })` e `mentionKeymap()`: "@" a inizio
    riga o dopo uno spazio apre l'elenco; `search(query, signal)` è dell'integratore, una
    ricerca più recente annulla la precedente e le risposte in ritardo vengono ignorate.
  - Scegliere una menzione è un passo di annulla a sé.

### Modificato

- Sola lettura (`editable: () => false`):
  - `@scriba/core`: opzione `readOnly` di `keymap()` e di `runKeymaps()`. In sola lettura girano
    solo le keymap marcate `readOnly: true`, e nessuna transazione che cambia il documento.
  - `@scriba/ui`: voci `readOnly` per pulsanti e menu (trova, schermo intero, sorgente),
    attive anche in sola lettura.
  - `@scriba/view`: l'area resta raggiungibile con Tab (`tabindex="0"`).
  - Da registrare con `readOnly: true`: `findReplaceKeymap` e `fullscreenKeymap`.
- `@scriba/plugin-markdown`: le foglie inline con `leafText` (es. menzioni) escono come testo.
- `@scriba/core`, cronologia: le transazioni aggiunte dai plugin (`appendTransaction`) fanno
  parte dello stesso passo di annulla della transazione che le ha generate. Esempio: una
  battitura trasformata in proposta si annulla con un solo Ctrl+Z.
- `@scriba/core`, cronologia: sostituire blocchi interi (tabella ricostruita, documento dalla
  vista sorgente) è sempre un passo di annulla a sé, mai unito alla digitazione.
- `@scriba/plugin-code-block`: la scorciatoia è Ctrl+Alt+Maiusc+C, perché Ctrl+Alt+C in Chrome apre
  gli strumenti per sviluppatori.

### Corretto

- In sola lettura le voci del menu "Altre opzioni" (toolbar stretta) erano attive e
  modificavano il documento.
- Backspace e Canc non uniscono più il testo attraverso il bordo di una tabella; una
  selezione che entra in una cella non sposta testo dentro o fuori dalla tabella.
- Invio su un blocco vuoto dentro una citazione la chiude.
- Tasti, copia, taglia e incolla subito dopo uno spostamento rapido del cursore agiscono sulla
  posizione attuale e non su quella precedente.
- Menu della toolbar non più tagliati; la toolbar non scorre più quando un menu prende il
  focus.
- Dimensione dei file immagine piccoli mostrata in byte.

### Sicurezza

- HTML in ingresso (incolla, `setContent`, import, vista sorgente, trascinamento, Markdown,
  risposte AI, aggiornamenti remoti) sempre analizzato in un documento inerte e ricostruito
  tramite lo schema: ciò che lo schema non conosce viene scartato.
- Whitelist URL (`http:`, `https:`, `mailto:`, `tel:`, relativi) con normalizzazione;
  immagini `data:` solo PNG, JPEG, GIF e WebP, mai SVG.
- Nessun attributo `style` libero: solo stili tipizzati e validati, applicati via CSSOM.
  Compatibile con CSP rigida e Trusted Types (policy `scriba` e `scriba-worker`).
- Le slice JSON accettano nodi incompleti solo come contenuto parziale; `replace()` verifica in
  profondità i nodi inseriti.
- Regex di trova e sostituisci eseguite in un Web Worker interrotto dopo 1 s.
- Collaborazione: identità, autore di commenti e proposte assegnati dal server; aggiornamenti
  remoti validati contro lo schema; limiti su messaggi, frequenza e dimensione del documento.
- Menzioni: id e nome validati (lunghezza, niente spazi nell'id, niente caratteri di controllo
  o di direzione); risultati della ricerca filtrati e mostrati solo come testo. Il nome è solo
  testo visibile: va risolto l'id sul server (nome attuale, permessi, notifiche).
- I mark di commento e di proposta non finiscono nell'HTML esportato e non si creano con un
  incolla.
- Suite di sicurezza: payload XSS noti, round-trip, fuzzing con `fast-check`, parità tra
  server e browser.
