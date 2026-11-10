# @scriba/plugin-fullscreen

Modalità **schermo intero** per l'editor Scriba: il contenitore (barra, area di scrittura, barra di
stato) copre la finestra e la pagina sotto smette di scorrere. Come il pulsante "Fullscreen" di
TinyMCE.

```bash
pnpm add @scriba/plugin-fullscreen
```

## Uso

```ts
import { keymap } from '@scriba/core'
import { Fullscreen, fullscreenKeymap, fullscreenToolbarItem } from '@scriba/plugin-fullscreen'

// il contenitore con barra, area di scrittura e barra di stato
const fullscreen = new Fullscreen(document.getElementById('app')!)

// nello stato dell'editor
plugins: [keymap(fullscreenKeymap(fullscreen), { priority: 80, readOnly: true })]

// nella barra degli strumenti o nel menu Visualizza
const button = fullscreenToolbarItem(fullscreen)
```

Il keymap va registrato con `readOnly: true`: lo schermo intero funziona anche in sola lettura.

## Esportazioni

| Nome                                | Cosa fa                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `new Fullscreen(target)`            | Gestisce lo schermo intero del contenitore `target`.         |
| `fullscreen.active`                 | `true` se lo schermo intero è attivo.                        |
| `fullscreen.toggle(view, on?)`      | Attiva, disattiva o inverte; l'editor mantiene il focus.     |
| `fullscreenKeymap(fullscreen)`      | Scorciatoie (vedi sotto).                                    |
| `fullscreenToolbarItem(fullscreen)` | Pulsante con `aria-pressed`, usabile anche in sola lettura.  |
| `FULLSCREEN_META`                   | Chiave dei metadati della transazione che aggiorna la barra. |

## Scorciatoie

| Tasto             | Azione                               |
| ----------------- | ------------------------------------ |
| Ctrl/Cmd+Maiusc+F | Attiva o disattiva lo schermo intero |
| Esc               | Esce (solo se è attivo)              |

## Note

- Sono solo **classi CSS**: `scriba-fullscreen` sul contenitore e `scriba-fullscreen-open` su
  `<html>`. Gli stili stanno in `@scriba/themes`.
- Non usa la Fullscreen API del browser: niente richieste di permesso, funziona negli iframe e con
  una CSP rigida (nessuno stile inline).
- Uscendo, la pagina torna alla posizione di scorrimento che aveva.
- Il cambio di stato invia una transazione vuota con metadati, così la barra aggiorna il pulsante
  premuto.

Per la tastiera e il focus vedi [accessibilità](../../../docs/accessibilita.md); per scrivere un
plugin simile, [plugin](../../../docs/plugin.md).
