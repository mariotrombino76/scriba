# @scriba-editor/plugin-math

Formule matematiche per l'editor Scriba: nel documento resta il sorgente **LaTeX**, nell'HTML c'è
**MathML** generato da KaTeX (lo mostra ogni browser, senza script). Un'uscita standard e senza script,
al posto di immagini o HTML libero.

```bash
pnpm add @scriba-editor/plugin-math
```

KaTeX è una dipendenza di **questo plugin soltanto** (il resto dell'editor non lo usa): lo importi tu
e lo passi a `createMathNodes` (serve KaTeX 0.16 o successivo), così puoi anche caricarlo solo quando
serve (`await import('katex')`).

## Uso

```ts
import katex from 'katex'
import { EditorState, Schema, keymap, basicSchemaSpec } from '@scriba-editor/core'
import { createTranslator } from '@scriba-editor/i18n'
import { EditorView } from '@scriba-editor/view'
import {
  createMathNodes,
  mathKeymap,
  mathNodeView,
  mathPlugins,
  mathSlashItem,
  mathToolbarItem,
} from '@scriba-editor/plugin-math'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...createMathNodes(katex) },
  marks: basicSchemaSpec.marks,
})

const t = createTranslator('it')
const state = EditorState.create({
  schema,
  plugins: [keymap(mathKeymap(t), { priority: 70 }), ...mathPlugins(t)],
})
// la vista: come appaiono le formule nell'editor
const view = new EditorView(document.querySelector('#editor')!, {
  state,
  nodeViews: { math_inline: mathNodeView(t), math_display: mathNodeView(t) },
})

// menu Inserisci e menu slash ("/formula")
const item = mathToolbarItem(t)
const slash = mathSlashItem(t)
```

## Nodi

| Nodo           | Dove                      | Note                              |
| -------------- | ------------------------- | --------------------------------- |
| `math_inline`  | dentro il testo           | atomo; testo semplice `$latex$`   |
| `math_display` | su una riga a sé (blocco) | atomo; testo semplice `$$latex$$` |

Attributo `latex` (al massimo `MAX_LATEX` = 4000 caratteri, senza caratteri di controllo tranne
a capo e tabulazione).

## Esportazioni

| Nome                                                    | Cosa fa                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `createMathNodes(katex)`                                | Le specifiche dei due nodi, con il KaTeX che passi.                         |
| `mathNodeView(t)`                                       | Vista del nodo: MathML in un riquadro con `role="math"` e `aria-label`.     |
| `openMathDialog(view, t)`                               | Dialogo: sorgente LaTeX, "formula su riga a sé", anteprima dal vivo.        |
| `insertMath(latex, display)`                            | Comando: inserisce una formula o cambia quella selezionata (anche il tipo). |
| `selectedMath(state)`                                   | La formula selezionata, se c'è.                                             |
| `mathKeymap(t)`                                         | Invio su una formula selezionata la modifica.                               |
| `mathPlugins(t)`                                        | Doppio clic su una formula la modifica.                                     |
| `mathToolbarItem(t)`, `mathSlashItem(t)`                | Voce "Formula" nel menu e nel menu slash (non nei blocchi di codice).       |
| `renderMathML`, `mathmlSpec`, `hasMath`, `MathRenderer` | Strumenti di basso livello.                                                 |

## Sicurezza

- Il documento memorizza **solo LaTeX**. Il MathML è **generato dall'editor** (non copiato): in
  lettura dell'HTML si prende soltanto l'annotazione `application/x-tex` e il MathML in ingresso
  viene buttato e rigenerato. Un MathML malevolo incollato non sopravvive.
- KaTeX gira sempre con le stesse opzioni restrittive: `trust: false` (niente `\href`, `\url`,
  `\includegraphics`, `\htmlClass`…), `maxExpand` e `maxSize` limitati contro le macro bomba, uscita
  solo MathML. L'albero MathML è convertito in nodi dall'editor, non da una stringa HTML.
- Una formula troppo complessa o con errore ripiega su un MathML vuoto con il sorgente leggibile
  nell'annotazione.
- Il rendering di ogni formula è messo in cache (al massimo 500 voci).

L'HTML salvato va ripassato da `@scriba-editor/sanitize-server`: vedi
[sicurezza](../../../docs/sicurezza.md).

## Accessibilità

Ogni formula ha `role="math"` e un'etichetta con il suo LaTeX; il dialogo ha focus trap, ritorno del
focus, anteprima in una regione `aria-live` ed errore annunciato (`role="alert"`). Modifica da
tastiera con Invio. Vedi [accessibilità](../../../docs/accessibilita.md) e
[plugin](../../../docs/plugin.md).
