# @scriba-editor/plugin-charmap

**Caratteri speciali ed emoji** per l'editor Scriba: una finestra con categorie, griglia di
caratteri e ricerca per nome (in italiano o inglese), come il "Special character" di TinyMCE ma con
emoji e nomi in due lingue. Inserisce testo semplice: nessun markup.

## Installazione

```bash
pnpm add @scriba-editor/plugin-charmap
```

## Uso

```ts
import { charmapToolbarItem, openCharmapDialog } from '@scriba-editor/plugin-charmap'

// pulsante (barra degli strumenti o menu Inserisci)
toolbarItems.push(charmapToolbarItem(t))

// voce del menu slash
const slashItem = {
  id: 'charmap',
  label: (tr) => tr('charmap.button'),
  keywords: ['emoji', 'simbolo', 'carattere', 'symbol'],
  icon: 'smile',
  run: (view) => openCharmapDialog(view, t),
}
```

`t` è il traduttore di `@scriba-editor/i18n` (`createTranslator('it')`).

## Cosa esporta

| Export                                 | Descrizione                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `charmapToolbarItem(t, options?)`      | Pulsante `charmap` (icona `smile`); attivo solo dove il cursore è in testo.     |
| `openCharmapDialog(view, t, options?)` | Apre la finestra; restituisce il `DialogHandle`.                                |
| `insertCharacter(view, entry)`         | Inserisce il carattere alla selezione (come digitato) e lo aggiunge ai recenti. |
| `searchCharacters(query)`              | Cerca per nome (italiano o inglese, senza accenti) o per il carattere stesso.   |
| `recentCharacters()`                   | Ultimi caratteri inseriti (al massimo 20, solo in questa pagina).               |
| `codePoints(text)`                     | Codici Unicode, es. `U+20AC`.                                                   |
| `CHARACTERS`, `EMOJI_CATEGORIES`       | Dati: categorie e voci (`CharEntry`, `CategoryId`).                             |

Opzioni (`CharmapOptions`):

- `locale`: lingua dei nomi, `'it'` o `'en'` (default: la lingua della pagina, altrimenti inglese);
- `columns`: caratteri per riga nella griglia (default 10, minimo 4).

Categorie: recenti, valute, punteggiatura, matematica, frecce, latino, greco, simboli, faccine,
persone, natura, cibo, oggetti, simboli emoji.

## Tastiera e accessibilità

- La ricerca ha il focus all'apertura; Freccia giù passa alla griglia.
- Schede delle categorie: frecce sinistra/destra, Home, Fine.
- Griglia: frecce in due dimensioni, Home, Fine; Invio inserisce il carattere e chiude.
- Ogni cella ha un `aria-label` con il nome del carattere; la finestra intrappola il focus e lo
  restituisce all'editor alla chiusura. Vedi [accessibilità](../../../docs/accessibilita.md).

## Note

- Si inserisce solo testo (`insertText`): niente HTML, quindi nessun rischio di iniezione. Vedi
  [sicurezza](../../../docs/sicurezza.md).
- La griglia imposta le colonne via CSSOM, compatibile con una CSP rigida.
- Vedi [plugin](../../../docs/plugin.md) per come collegare i pulsanti alla toolbar e al menu slash.
