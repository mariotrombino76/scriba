# Accessibilità

Scriba punta a WCAG 2.2 livello AA: ogni funzione si raggiunge da tastiera e ha un nome per i
lettori di schermo.

## Ruoli e nomi

- L'area di scrittura ha `role="textbox"`, `aria-multiline="true"` e un nome (`label`, default
  "Editor di testo formattato"); in sola lettura `aria-readonly="true"`.
- La toolbar ha `role="toolbar"` con gruppi con nome; i pulsanti attivi hanno `aria-pressed`, i
  menu `aria-haspopup`/`aria-expanded`, le scorciatoie compaiono nel suggerimento.
- La barra dei menu segue il pattern WAI-ARIA _menubar_; il menu del tasto destro il pattern
  _menu_.
- I dialog sono modali veri (`<dialog>`): il focus resta dentro e torna dove era alla chiusura.
- Gli stati che cambiano (risposta dell'AI, collaborazione, conteggio parole) sono annunciati
  con `role="status"`.
- Un'interruzione di pagina viene letta come "Interruzione di pagina"; immagini con testo
  alternativo (o dichiarate decorative).

## Tastiera

`Mod` è Ctrl su Windows/Linux e ⌘ su macOS. L'elenco completo, sempre aggiornato con i plugin in
uso, è nel menu **Aiuto ▸ Scorciatoie da tastiera** (Alt+0).

| Tasti                     | Azione                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| Mod+B / I / U             | Grassetto / corsivo / sottolineato                               |
| Mod+Maiusc+S, Mod+E       | Barrato, codice in linea                                         |
| Mod+. , Mod+,             | Apice, pedice                                                    |
| Mod+Maiusc+Spazio         | Spazio non separabile                                            |
| Mod+Alt+C / Mod+Alt+V     | Copia formato / applicalo alla selezione (Esc annulla l'attesa)  |
| Mod+Alt+0 … 6             | Paragrafo, Titolo 1…6                                            |
| Mod+K                     | Link                                                             |
| Mod+S                     | Salva (con `@scriba-editor/plugin-save`)                         |
| Mod+Z, Mod+Y              | Annulla, ripeti                                                  |
| Maiusc+Invio              | A capo nello stesso paragrafo                                    |
| Tab, Maiusc+Tab           | Rientro negli elenchi, cella successiva/precedente nelle tabelle |
| Mod+Maiusc+V              | Incolla come testo semplice                                      |
| Mod+F, Mod+Maiusc+F       | Trova e sostituisci, schermo intero                              |
| Mod+J                     | Assistente AI                                                    |
| Alt+F10                   | Nella barra di formattazione della selezione                     |
| Maiusc+F10 (o tasto menu) | Menu contestuale                                                 |
| Alt+0                     | Scorciatoie da tastiera                                          |
| Esc                       | Chiude menu e finestre                                           |

Nella toolbar e nei menu: un solo punto di tabulazione, frecce per spostarsi, Invio/Spazio per
scegliere, Esc per tornare all'editor.

Nella barra di stato: il **percorso dell'elemento** è una navigazione con un pulsante per blocco
(seleziona quel blocco), un solo punto di tabulazione e frecce sinistra/destra per spostarsi; la **maniglia di ridimensionamento** è un pulsante che cambia l'altezza
con le frecce su e giù (Pag su/giù per passi più grandi), Esc torna all'altezza automatica.

## Verifica automatica

Ogni modifica passa da `e2e/a11y.spec.ts`: axe-core controlla le regole WCAG 2.0, 2.1 e 2.2 di
livello A e AA (più le buone pratiche) su editor, bubble menu, menu contestuale, ogni menu della
barra, ogni finestra che si apre dai menu, tema scuro e le pagine inline, script classico e
React, in Chromium, Firefox e WebKit. Il test fallisce alla prima violazione. Non sostituisce la
prova con un lettore di schermo (NVDA, VoiceOver), che resta da fare a mano prima di ogni
rilascio.

Alcuni punti curati in particolare:

- **Etichetta nel nome** (2.5.3): le voci di menu prendono il nome dal testo visibile; la
  scorciatoia accanto è nascosta ai lettori di schermo e dichiarata in `aria-keyshortcuts`
  nel formato ARIA (`Control+Alt+0`, `Meta+K` su macOS).
- **Dimensione dei bersagli** (2.5.8): almeno 24px; con il tocco pulsanti e voci di menu 44px.
- **Focus non coperto** (2.4.11): con la barra fissa in alto il cursore resta visibile sotto la
  barra.
- **Aree che scorrono** raggiungibili da tastiera (elenco delle scorciatoie).
- **Trascinamenti** (2.5.7): ogni azione che si fa trascinando ha un'alternativa: larghezza
  dell'immagine nel suo dialog, colonne dal menu Tabella, ritaglio con i campi numerici, altezza
  dell'editor con le frecce sulla maniglia.

## Contrasto e temi

I colori del tema rispettano il contrasto AA in chiaro e in scuro (il tema segue le preferenze
del sistema). Anche i link nel testo e i pannelli fuori dall'editor (commenti, barra di stato)
hanno i colori del tema. Se ridefinisci le variabili CSS, verifica di nuovo il contrasto.

## Verifica accessibilità del contenuto

L'editor è accessibile, ma il **documento** dipende da chi scrive: un'immagine senza
descrizione o un titolo saltato lo rendono difficile da usare. `@scriba-editor/plugin-a11y-checker`
controlla il documento come l'Accessibility Checker di TinyMCE.

Pensala come il correttore ortografico, ma per chi usa un lettore di schermo: trova i punti
dove queste persone si perderebbero, ti spiega perché e ti propone la correzione.

```ts
import { a11yChecker, a11yCheckerItem } from '@scriba-editor/plugin-a11y-checker'

const plugins = [a11yChecker({ level: 'AA' }) /* , … */]
// nel menu Strumenti o nella toolbar:
const item = a11yCheckerItem(t)
```

**Strumenti ▸ Verifica accessibilità…** apre un dialog con un problema alla volta. Il problema
è selezionato ed evidenziato nel testo (il dialog sta in basso a destra per lasciarlo vedere).
Il dialog mostra gravità (errore, avviso, suggerimento), spiegazione, criterio WCAG 2.2 con il
link alla pagina del W3C e la correzione: un campo (testo alternativo, testo del link,
didascalia, titolo), il livello del titolo o un pulsante. Ogni correzione è un passo di
annullamento. **Ignora** nasconde il problema fino a quando l'editor viene ricaricato (non
scrive nulla nel documento). In sola lettura i problemi si vedono ma non si correggono.

| Controllo              | Cosa trova                                                                  | Criterio  |
| ---------------------- | --------------------------------------------------------------------------- | --------- |
| `image-alt`            | Immagine senza testo alternativo (né descritta né decorativa)               | 1.1.1 A   |
| `image-alt-filename`   | Testo alternativo che è un nome di file, di fotocamera o "immagine"         | 1.1.1 A   |
| `image-alt-long`       | Testo alternativo oltre 150 caratteri (suggerimento)                        | 1.1.1 A   |
| `link-no-text`         | Link senza testo (o solo con un'immagine decorativa)                        | 2.4.4 A   |
| `link-text`            | Testo del link generico: "clicca qui", "leggi tutto", "read more"…          | 2.4.4 A   |
| `adjacent-links`       | Due link vicini allo stesso indirizzo                                       | 2.4.4 A   |
| `heading-empty`        | Titolo vuoto                                                                | 1.3.1 A   |
| `heading-order`        | Livello del titolo saltato (h2 → h4)                                        | 1.3.1 A   |
| `paragraph-as-heading` | Paragrafo breve tutto in grassetto usato come titolo                        | 1.3.1 A   |
| `fake-list`            | Paragrafi che iniziano con "-", "•" o "1." al posto di un elenco            | 1.3.1 A   |
| `table-headers`        | Tabella senza celle di intestazione                                         | 1.3.1 A   |
| `table-header-empty`   | Cella di intestazione vuota                                                 | 1.3.1 A   |
| `table-caption`        | Tabella senza didascalia                                                    | 1.3.1 A   |
| `embed-title`          | Video, audio o mappa incorporati senza titolo                               | 4.1.2 A   |
| `contrast`             | Testo colorato con contrasto sotto 4,5:1 (3:1 se grande); a livello AAA 7:1 | 1.4.3 AA  |
| `justified-text`       | Testo giustificato (solo a livello AAA)                                     | 1.4.8 AAA |

Opzioni di `a11yChecker()`: `level` (`'A'`, `'AA'`, `'AAA'`), `rules` (per spegnere un
controllo: `{ 'table-caption': false }`), `background` e `color` (i colori della pagina dove
il testo sarà mostrato, per il contrasto; predefiniti bianco e nero), `genericLinkTexts`,
`maxAltLength`.

Il contrasto si controlla solo dove il testo ha un colore suo (colore, evidenziazione, sfondo
della cella): il resto prende i colori della pagina, che sono responsabilità del sito.

### Sul server

`checkAccessibility(doc, options)` è una funzione pura, senza DOM: con lo stesso schema puoi
usarla nel backend, per esempio per avvisare o non pubblicare un documento con errori.

```ts
const errors = checkAccessibility(doc).filter((i) => i.severity === 'error')
```

### Immagini: "da descrivere" e "decorativa"

Nel documento un'immagine ha `alt: null` finché nessuno l'ha descritta (nell'HTML: niente
attributo `alt`) e `alt: ''` quando è decorativa (`alt=""`: i lettori di schermo la saltano).
Così un'immagine incollata o caricata senza descrizione non passa per decorativa.

## Cosa resta a chi integra

- Dai all'editor un'etichetta significativa nel contesto (`label: 'Testo della nota'`).
- Se mostri un errore di salvataggio o validazione, annuncialo (`role="alert"`) vicino
  all'editor.
- Non togliere i contorni del focus (`:focus-visible`) nel tuo CSS.
