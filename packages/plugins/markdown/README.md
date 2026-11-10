# @scriba-editor/plugin-markdown

Markdown per l'editor Scriba: **scorciatoie mentre si scrive** (`# ` diventa titolo, `- ` elenco,
`**x**` grassetto), **importazione** e **esportazione**. È una capacità che TinyMCE non offre di serie: qui è integrata.

```bash
pnpm add @scriba-editor/plugin-markdown
```

## Uso

```ts
import { markdownShortcuts, parseMarkdown, serializeMarkdown } from '@scriba-editor/plugin-markdown'

// nello stato dell'editor: scorciatoie in digitazione + Backspace che le annulla
plugins: [...markdownShortcuts(schema)]

// importazione: Markdown -> documento (nel browser)
const doc = parseMarkdown(schema, '# Titolo\n\n- uno\n- due')

// esportazione: documento -> Markdown
const md = serializeMarkdown(view.state.doc)
```

## Scorciatoie in digitazione

Le regole esistono solo per i nodi e i mark che lo schema ha.

| Digiti                         | Risultato                                  |
| ------------------------------ | ------------------------------------------ |
| `# ` … `###### `               | Titolo da 1 a 6                            |
| `- `, `* `, `+ `               | Elenco puntato                             |
| `1. ` o `1) `                  | Elenco numerato (parte dal numero scritto) |
| `> `                           | Citazione                                  |
| ` ``` ` (anche con linguaggio) | Blocco di codice                           |
| `---`, `___`, `***` da soli    | Linea orizzontale                          |
| `**x**` o `__x__`              | Grassetto                                  |
| `*x*` o `_x_`                  | Corsivo                                    |
| `~~x~~`                        | Barrato                                    |
| `` `x` ``                      | Codice in linea                            |
| `[testo](https://…)`           | Link (URL controllato dalla whitelist)     |

Ogni regola è **un passo annullabile a sé**: **Backspace subito dopo** (o Ctrl+Z) restituisce il
testo digitato (`# `) invece del titolo. Le regole non agiscono durante la composizione IME né, di
norma, nel codice.

## Esportazioni

| Nome                                                                              | Cosa fa                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `markdownShortcuts(schema)`                                                       | Plugin delle scorciatoie + keymap Backspace (priorità 100).                      |
| `parseMarkdown(schema, markdown, options?)`                                       | Markdown -> documento (solo browser: usa `DOMParser`).                           |
| `markdownToHTML(markdown, maxLength?)`                                            | Markdown -> stringa HTML. **Non sicura da mostrare così com'è.**                 |
| `serializeMarkdown(doc)`                                                          | Documento -> Markdown.                                                           |
| `inputRules`, `markdownInputRules`, `undoInputRule`, `inputRulesKey`, `InputRule` | Per scrivere le tue regole di digitazione.                                       |
| `DEFAULT_MAX_MARKDOWN_LENGTH`, `MarkdownParseOptions`                             | Limiti: `maxLength` (default 2 000 000 caratteri) e `parse` (profondità e nodi). |

Importazione: CommonMark più tabelle e barrato GFM; niente autolink né tipografia automatica.

## Sicurezza

L'importazione è **input non fidato**, come un incolla:

- il Markdown è trasformato da `markdown-it` con **HTML grezzo disattivato** (un `<script>` scritto
  nel Markdown resta testo);
- il risultato è letto in un **documento inerte** e ricostruito dal parser dello schema: ciò che lo
  schema non conosce viene scartato, e i link passano dalla whitelist di URL;
- la lunghezza massima e i limiti di profondità e di nodi evitano il blocco della pagina.
- Se usi `markdownToHTML` direttamente, passa sempre il risultato dal parser dello schema o da
  `@scriba-editor/sanitize-server`.
- Nelle regole di digitazione i link passano dalla stessa whitelist (`http`, `https`, `mailto`,
  `tel`, relativi).

Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md); le scorciatoie sono
elencate anche nella finestra di `@scriba-editor/plugin-help` (`markdownHelp()`).
