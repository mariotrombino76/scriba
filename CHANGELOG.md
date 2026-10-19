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
  - Generative UI nel documento: azioni che rispondono con blocchi (`blockAiActions`: Crea una
    tabella, Estrai le attività, Metti in un riquadro). Il modello risponde in NDJSON (un nodo
    JSON per riga); `blocksParser` valida ogni riga con lo schema (`nodeFromJSON`) e con una
    whitelist (tipi di primo livello dell'azione; dentro solo contenitori e testo; mark di sola
    formattazione, niente immagini, menzioni, commenti né link se non richiesti) e limiti su
    blocchi, nodi e profondità. I blocchi compaiono man mano che le righe sono complete.
  - Per il backend: la richiesta porta `output: "blocks"` e `blocks`; `aiBlocksPrompt` e
    `aiBlocksJsonSchema` descrivono il formato al modello.
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
- `@scriba/plugin-permissions`: blocchi protetti.
  - `withBlockIds`: id opzionale dei blocchi (`data-block-id`), assegnato dall'integratore.
  - `blockPermissions({ canEdit, t, allowMarks, trusted, onRefused })`: un blocco con
    `canEdit(id) === false` non si modifica, non si cancella e non si duplica. Restano possibili
    lettura, selezione e commenti. Avviso letto dagli screen reader; le modifiche remote della
    collaborazione passano.
  - Gli id incollati vengono tolti; quando un blocco viene diviso, l'id resta a un solo pezzo.
  - `checkBlockEdits(prima, dopo, regole)` per il server, `transactionAllowed(tr, regole)`.
- Node view (nodi disegnati da un componente):
  - `@scriba/view`: opzione `nodeViews` per i nodi atomici (`dom`, `update`, `selectNode`,
    `deselectNode`, `stopEvent`, `destroy`) e `view.nodeDOM(pos)`. Mutazioni ed eventi dei
    controlli interni restano al componente. L'HTML esce sempre da `toHTML`.
  - `@scriba/vue`: `vueNodeView(Componente, { t, appContext })`, opzione `nodeViews` di
    `useScriba` e di `<ScribaEditor>`, componente d'esempio `TaskView`.
  - Node view con contenuto modificabile: la node view fornisce `contentDOM`, dove l'editor
    disegna e modifica il contenuto del nodo come altrove; il resto resta del componente
    (`contenteditable="false"`). In Vue: `<NodeViewContent />`.
  - `@scriba/ui`: barra dei menu `<scriba-menubar>` sopra la toolbar, come TinyMCE (File, Modifica,
    Visualizza, Inserisci, Formato, Strumenti, Tabella). Pattern WAI-ARIA menubar; riusa i controlli
    della toolbar (i menu diventano sottomenu, stessi permessi); `'|'` separa i gruppi. Nuove voci
    `clearFormatItem` (rimuovi formattazione, link e commenti restano) e `selectAllItem`.
  - Menu del tasto destro come TinyMCE: `contextMenu(view, { sections })` in `@scriba/ui`,
    sezioni `linkContextMenu` (modifica, rimuovi, apri in nuova scheda con `noopener`),
    `imageContextMenu` (il clic destro seleziona l'immagine) e `tableContextMenu` (sottomenu
    Cella, Riga, Colonna; proprietà ed elimina tabella). Dove nessuna sezione si applica, e con
    Ctrl (Cmd su macOS), resta il menu del browser; tasto menu e Maiusc+F10 lo aprono al cursore.
    `MenuPopup.openAt(x, y)`, `popupEntries`, `withoutPressed`.
  - Taglia, Copia, Incolla e Incolla come testo nel menu Modifica, come TinyMCE
    (`clipboardItems`). Copia e taglia usano l'evento `copy` del browser (riempito dal
    serializzatore), poi l'API Clipboard; Incolla legge gli appunti con l'API Clipboard (il
    browser può chiedere il permesso) e, se il browser rifiuta, un messaggio indica Ctrl+V.
- `@scriba/view`: `view.clipboardContent()` e `view.paste({ html, text, files })`: stesso
  percorso dell'evento `paste` (documento inerte, pulizia dei plugin, parser dello schema).
- `@scriba/plugin-hr`: linea orizzontale (`<hr>`) e interruzione di pagina
  (`<hr class="scriba-page-break">`, nuova pagina in stampa e in Word), come i plugin hr e
  pagebreak di TinyMCE. Menu Inserisci, comandi "/", Markdown `---`. Nessun attributo: altre
  classi e attributi di un `<hr>` vengono scartati, anche da `sanitize-server`.
- `@scriba/plugin-datetime`: Inserisci ▸ Data/ora, come insertdatetime di TinyMCE: ora, data
  ISO, data estesa e breve nella lingua della pagina, inserite come testo semplice. Le voci
  mostrano l'ora del momento in cui si apre il menu (`live` nelle voci dei menu di `@scriba/ui`).
- `@scriba/plugin-help`: menu "Aiuto" con le scorciatoie da tastiera, come il plugin help di
  TinyMCE (Alt+0, anche in sola lettura). `helpItem`, `helpKeymap`, `openHelpDialog`; gruppi
  `shortcutsFromItems` (le scorciatoie di toolbar e menu, con le loro etichette),
  `editingHelp`, `markdownHelp`, `navigationHelp`. Dialog con una tabella per gruppo e ricerca.
- `@scriba/plugin-file`: menu "File" come in TinyMCE, tutto nel browser.
  - Apri (.docx, .html, .md, .txt), anche trascinando il file; prima chiede conferma se ci sono
    modifiche non salvate.
  - Scarica come HTML, Word (.docx), Markdown e testo; anteprima e stampa (da cui il PDF).
  - Nuovo documento; Ctrl/Cmd+O, Ctrl/Cmd+S, Ctrl/Cmd+P.
  - Dipendenze nuove solo del plugin, caricate quando servono: `mammoth` 1.13.0 (lettura .docx),
    `docx` 9.8.1 (scrittura .docx), `jszip` 3.10.2. Override `mammoth>argparse` 2.0.1: argparse
    serve solo alla riga di comando di mammoth e toglie `sprintf-js` (GHSA-hp3w-g68c-fv3c).
- `@scriba/plugin-callout`: riquadro (`<aside class="scriba-callout" data-callout>`, tipi
  info, consiglio, avviso, pericolo), `toggleCallout`, voce toolbar e voce slash; componente
  d'esempio `CalloutView` in `@scriba/vue`, con il tipo scelto da un gruppo di pulsanti radio.
  - `@scriba/plugin-task`: nodo `task` (titolo, fatto, scadenza), `insertTask`, `taskKeymap`
    (Invio entra nei campi, Spazio segna fatto), voce toolbar e voce slash.
- `@scriba/core`: `arrowAtom` nella `baseKeymap`. Con le frecce si entra in un blocco atomico
  (viene selezionato) e se ne esce verso il testo vicino, invece di saltarlo.
- `@scriba/collab-server`: `canEditBlock` in `AuthResult` e opzioni `schema`/`field`. Un
  aggiornamento che tocca un blocco protetto viene annullato per tutti, mittente compreso
  (`applyGuardedUpdate`).

### Modificato

- Ruolo "commentatore" (sola lettura, ma può commentare):
  - `@scriba/core`: opzione `annotation` dei mark (il mark commento la usa), `isAnnotationOnly(tr)`,
    `runKeymaps(..., { readOnly, canAnnotate })`.
  - `@scriba/view`: opzione `canAnnotate`. I commentatori hanno il cursore (selezione da tastiera)
    con `aria-readonly`; in sola lettura nessun testo scritto dal browser (IME, correttore) cambia
    il documento.
  - `@scriba/ui`: voci `annotates`, attive per i commentatori; passano solo transazioni che
    toccano annotazioni.
  - `@scriba/collab-server`: `canComment` in `AuthResult`; livello `comment` comunicato al client
    (`provider.canComment`); aggiornamenti dei commentatori accettati solo se toccano annotazioni
    (`applyAnnotationUpdate`), altrimenti annullati per tutti; canale commenti aperto ai
    commentatori.
- Sola lettura (`editable: () => false`):
  - `@scriba/core`: opzione `readOnly` di `keymap()` e di `runKeymaps()`. In sola lettura girano
    solo le keymap marcate `readOnly: true`, e nessuna transazione che cambia il documento.
  - `@scriba/ui`: voci `readOnly` per pulsanti e menu (trova, schermo intero, sorgente),
    attive anche in sola lettura.
  - `@scriba/view`: l'area resta raggiungibile con Tab (`tabindex="0"`).
  - Da registrare con `readOnly: true`: `findReplaceKeymap` e `fullscreenKeymap`.
- `@scriba/plugin-markdown`: le foglie inline con `leafText` (es. menzioni) escono come testo.
- `@scriba/core`: `textBetween` separa anche i blocchi atomici (es. attività) dal testo vicino.
- `@scriba/core`, cronologia: le transazioni aggiunte dai plugin (`appendTransaction`) fanno
  parte dello stesso passo di annulla della transazione che le ha generate. Esempio: una
  battitura trasformata in proposta si annulla con un solo Ctrl+Z.
- `@scriba/core`, cronologia: sostituire blocchi interi (tabella ricostruita, documento dalla
  vista sorgente) è sempre un passo di annulla a sé, mai unito alla digitazione.
- `@scriba/plugin-code-block`: la scorciatoia è Ctrl+Alt+Maiusc+C, perché Ctrl+Alt+C in Chrome apre
  gli strumenti per sviluppatori.

### Corretto

- `@scriba/view`: dopo aver selezionato un blocco o un'immagine (clic sopra), un clic nel testo
  non spostava la selezione: quello che si scriveva dopo sostituiva il nodo. Ora il clic sposta il
  cursore.
- `@scriba/view`: scrivere con un blocco selezionato (linea, tabella…) metteva il testo nel
  paragrafo precedente; ora il blocco diventa un paragrafo con il testo, al suo posto.
- `@scriba/core`: Invio con un blocco selezionato crea un paragrafo dopo (prima, se è il primo
  blocco: così si può scrivere sopra una linea o una tabella in cima). Nuovo comando
  `createParagraphNear` nella `baseKeymap`.

- `@scriba/plugin-ai`: Accetta e Scarta di una risposta fatta di blocchi in mezzo a un paragrafo
  (che lo spezza) fallivano o ricucivano male il testo; ora il ripristino usa i blocchi interi
  che la contenevano, mappati come l'intervallo della risposta. Il ripiego per un blocco che non
  può stare dove va inserisce il testo già validato, mai la risposta grezza.

- In sola lettura il pannello commenti permetteva di accettare o rifiutare le modifiche proposte ed
  eliminare discussioni. Ora accetta e rifiuta richiedono la modifica, le azioni sui commenti il
  permesso di commentare.
- Scorciatoie Markdown, `/` e `@` non funzionavano con l'IME e con le tastiere Android, che
  scrivono il testo da sole. Ora quel testo passa da `handleTextInput` come quello digitato.
- IME: più caratteri letti insieme (due composizioni ravvicinate, per esempio `" @"`) passano
  da `handleTextInput` uno alla volta, come se fossero digitati.
- IME: una composizione che iniziava subito dopo un'altra (spazio, poi una lettera) veniva
  interrotta. La view rileggeva e ridisegnava il blocco mentre l'IME ci stava ancora scrivendo.
- `@scriba/core`: `lift` (e quindi `toggleWrap`/`toggleBlockquote`) andava in `TypeError` con
  una selezione tra due blocchi; ora usa i limiti dell'intervallo.
- Firefox: il primo clic in un editor senza focus metteva il cursore nella posizione
  precedente invece che nel punto cliccato.
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
- File aperti: input non fidato. HTML e Word passano da documento inerte e parser dello schema con
  limiti; i .docx vengono controllati prima di decomprimerli (dimensione dichiarata, numero di voci)
  e `mammoth` non legge mai file collegati (`externalFileAccess: false`).
- Riquadri: diventa riquadro solo un `<aside>` con `data-callout`; il tipo viene da una lista
  chiusa (un valore sconosciuto diventa `info`) e il contenuto passa dallo schema.
- Attività: titolo su una riga (niente caratteri di controllo), data `AAAA-MM-GG` reale, stato
  booleano; nell'HTML solo testo e tre attributi `data-` di forma fissa.
- Blocchi protetti: la regola vale nell'editor ma va ripetuta sul server con `checkBlockEdits`
  (il client non è fidato). Un blocco nuovo non può prendere un id protetto.
- Menzioni: id e nome validati (lunghezza, niente spazi nell'id, niente caratteri di controllo
  o di direzione); risultati della ricerca filtrati e mostrati solo come testo. Il nome è solo
  testo visibile: va risolto l'id sul server (nome attuale, permessi, notifiche).
- I mark di commento e di proposta non finiscono nell'HTML esportato e non si creano con un
  incolla.
- Suite di sicurezza: payload XSS noti, round-trip, fuzzing con `fast-check`, parità tra
  server e browser.
