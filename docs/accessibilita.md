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
| Mod+Alt+0 … 6             | Paragrafo, Titolo 1…6                                            |
| Mod+K                     | Link                                                             |
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

## Contrasto e temi

I colori del tema rispettano il contrasto AA in chiaro e in scuro (il tema segue le preferenze
del sistema). Se ridefinisci le variabili CSS, verifica di nuovo il contrasto.

## Cosa resta a chi integra

- Dai all'editor un'etichetta significativa nel contesto (`label: 'Testo della nota'`).
- Se mostri un errore di salvataggio o validazione, annuncialo (`role="alert"`) vicino
  all'editor.
- Non togliere i contorni del focus (`:focus-visible`) nel tuo CSS.
