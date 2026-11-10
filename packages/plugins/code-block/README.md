# @scriba-editor/plugin-code-block

**Blocchi di codice** per l'editor Scriba, con evidenziazione della sintassi e scelta del
linguaggio. Come il plugin "Code sample" di TinyMCE, ma l'evidenziazione produce **decorazioni**,
mai HTML: nessuna stringa dell'evidenziatore arriva alla pagina.

## Installazione

```bash
pnpm add @scriba-editor/plugin-code-block lowlight
```

Il pacchetto dipende da `lowlight` 3.3.0; nell'app crei tu l'istanza con le grammatiche che vuoi
(l'esempio sotto usa quelle comuni).

## Uso

```ts
import {
  codeBlockKeymap,
  codeBlockNodes,
  codeBlockToolbarItems,
  codeHighlight,
  toggleCodeBlock,
} from '@scriba-editor/plugin-code-block'
import { common, createLowlight } from 'lowlight'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...codeBlockNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [
    codeHighlight({ lowlight: createLowlight(common) }),
    keymap(codeBlockKeymap(), { priority: 60 }),
    // …
  ],
})

// pulsante del blocco e menu del linguaggio (visibile solo dentro un blocco di codice)
const items = codeBlockToolbarItems(schema)
```

## Cosa esporta

| Export                                                                                                                   | Descrizione                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `codeBlockNodes`                                                                                                         | Nodo `code_block`: solo testo, niente mark, attributo `language` (o `null`).      |
| `codeHighlight(options)`                                                                                                 | Plugin di evidenziazione come decorazioni; `codeHighlightKey` ne è la chiave.     |
| `codeBlockKeymap()`                                                                                                      | Scorciatoie (vedi sotto).                                                         |
| `codeBlockToolbarItems(schema, languages?)`                                                                              | Pulsante `code_block` e menu `code_language` (voce "testo semplice" + linguaggi). |
| `defaultCodeLanguages`                                                                                                   | JavaScript, TypeScript, HTML/XML, CSS, JSON, Python, PHP, Java, C#, SQL, Bash.    |
| `toggleCodeBlock`, `setCodeLanguage(lang)`, `exitCodeBlock`, `exitOnTripleEnter`, `resetEmptyCodeBlock`, `isInCodeBlock` | Comandi.                                                                          |
| `LANGUAGE`                                                                                                               | Espressione regolare dei nomi di linguaggio ammessi.                              |

Opzioni di `codeHighlight` (`HighlightOptions`):

- `lowlight` (obbligatoria): istanza di lowlight con le grammatiche registrate;
- `autoDetect`: indovina il linguaggio dei blocchi senza (più lento; default `false`);
- `maxLength`: i blocchi più lunghi non si evidenziano (default 100 000 caratteri).

I linguaggi del menu devono essere registrati nella tua istanza di lowlight; per cambiarli passa
un secondo argomento a `codeBlockToolbarItems`: `[{ id: 'python', label: 'Python' }, …]`.

## Scorciatoie

| Tasti                        | Azione                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| Maiusc+Mod+Alt+C             | Blocco di codice acceso/spento (non Mod+Alt+C, usata da DevTools) |
| Mod+Invio                    | Esce dal blocco, con un nuovo paragrafo sotto                     |
| Invio (dopo due righe vuote) | Esce dal blocco, togliendo le righe vuote (tre Invio di fila)     |
| Backspace in un blocco vuoto | Lo riporta a paragrafo                                            |

`Tab` **non** è catturato: chi usa la tastiera può sempre uscire dall'editor (WCAG).

## Note

- HTML: `<pre><code class="language-js">…</code></pre>`. In lettura il linguaggio viene da
  `data-language` o da una classe `language-xxx`/`lang-xxx` su `<pre>` o su `<code>`; la `class`
  scritta deriva solo dal linguaggio **validato**, mai dall'input. Vedi
  [sicurezza](../../../docs/sicurezza.md).
- L'evidenziatore usa solo i nomi di classe (limitati a `[\w-]`) e le lunghezze del testo; i
  risultati sono in cache per blocco, quindi i blocchi invariati non si rielaborano. Gli errori
  dell'evidenziatore non interrompono mai la scrittura.
- I colori dei token vengono dal tema (`@scriba-editor/themes`). Vedi [plugin](../../../docs/plugin.md).
