# @scriba/plugin-word-count

Conteggio di parole e caratteri come il plugin `wordcount` di TinyMCE: un contatore nella barra di stato e un dialogo con i numeri del documento e della selezione.

```bash
pnpm add @scriba/plugin-word-count
```

## Uso

```ts
import { createWordCountStatus, openWordCountDialog } from '@scriba/plugin-word-count'

// contatore nella barra di stato (un pulsante che apre il dialogo)
statusbar.append(createWordCountStatus(view, t).el)

// voce di menu "Conteggio parole"
const wordCountItem: ToolbarButton = {
  type: 'button',
  id: 'wordcount',
  label: (tr) => tr('wordcount.title'),
  command: () => true,
  readOnly: true,
  run: (v) => void openWordCountDialog(v, t),
}
```

## Esportazioni

| Nome                                       | Cosa fa                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `createWordCountStatus(view, t, options?)` | Pulsante "N parole"; restituisce `{ el, destroy() }`                                                   |
| `openWordCountDialog(view, t, options?)`   | Dialogo con parole, caratteri e caratteri senza spazi, per documento e selezione                       |
| `WordCountOptions`                         | `locale` (predefinito: lingua della pagina), `delay` (ms di pausa prima di ricontare, predefinito 300) |
| `countString(text, locale?)`               | `{ words, characters, charactersNoSpaces }` di un testo                                                |
| `countWords(text, locale?)`                | Solo le parole (più veloce)                                                                            |
| `countRange(doc, from?, to?, locale?)`     | Conteggio di un intervallo del documento                                                               |
| `countState(state, locale?)`               | `{ document, selection }`; `selection` è `null` se non c'è selezione                                   |
| `rangeText(doc, from?, to?)`               | Testo semplice di un intervallo: blocchi, a capo e immagini separano le parole                         |
| `TextCount`                                | Tipo del risultato                                                                                     |

## Come conta

Le parole vengono da `Intl.Segmenter` quando disponibile, quindi funziona anche per lingue senza spazi come il giapponese (altrimenti una regola di riserva su lettere e cifre, con apostrofo e trattino interni: "l'albero", "e-mail"). I caratteri sono quelli percepiti dalle persone (un'emoji o "é" vale uno), con gli spazi ma senza gli a capo. Il contatore si aggiorna quando si smette di scrivere (`delay`), così resta fluido nei documenti grandi.

## Accessibilità

Il contatore è un `<button>` raggiungibile da tastiera; il dialogo ha focus trap, restituisce il focus all'editor e presenta i numeri in una vera tabella con intestazioni di colonna e di riga (`scope`). Il singolare e il plurale ("1 parola", "2 parole") sono tradotti, e i numeri seguono il formato della lingua.

## Note

Il testo è calcolato dal documento (mai dal DOM) e mostrato come testo. Vedi [plugin](../../../docs/plugin.md) e [accessibilità](../../../docs/accessibilita.md). Si affianca al percorso e alla maniglia di [@scriba/plugin-statusbar](../statusbar/README.md).
