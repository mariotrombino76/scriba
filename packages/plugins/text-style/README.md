# @scriba/plugin-text-style

Formattazione del testo come in TinyMCE: allineamento, rientro, interlinea, direzione (LTR/RTL), colore del testo e dello sfondo, font e dimensione, maiuscole/minuscole e **stili con classi** del tuo sito (`style_formats`). Colori e font sono mark tipizzati, non `style` libero.

```bash
pnpm add @scriba/plugin-text-style
```

## Uso

```ts
import { keymap } from '@scriba/core'
import {
  alignmentMenu,
  caseMenu,
  classFormatsMenu,
  classMarks,
  colorItems,
  directionItems,
  fontItems,
  indentItems,
  lineHeightMenu,
  textStyleKeymap,
  textStyleMarks,
  withBlockClasses,
  withBlockStyles,
} from '@scriba/plugin-text-style'

const BLOCK_CLASSES = ['nota-margine', 'avviso'] // classi che il tuo sito stila

const schema = new Schema({
  nodes: withBlockClasses(withBlockStyles({ ...basicSchemaSpec.nodes /* ... */ }), BLOCK_CLASSES),
  marks: { ...basicSchemaSpec.marks, ...textStyleMarks, ...classMarks(['evidenza']) },
})

const plugins = [
  keymap(textStyleKeymap({ indent: listIndentCommands(schema) })), // Tab nelle liste e rientro con un solo tasto
]

// toolbar e menu
const items = [
  alignmentMenu(),
  ...indentItems(),
  ...colorItems(schema),
  ...fontItems(schema),
  lineHeightMenu(),
  ...directionItems(),
  caseMenu('it'),
  classFormatsMenu(schema, [{ label: 'Nota a margine', class: 'nota-margine', kind: 'block' }]),
]
```

## Esportazioni

| Nome                                                                                                                                | Cosa fa                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `textStyleMarks`                                                                                                                    | Mark `text_color`, `background_color`, `font_family`, `font_size` (valori validati e normalizzati)                              |
| `withBlockStyles(nodes, names?)`                                                                                                    | Aggiunge `align`, `indent` (0-8, 2em a livello), `lineHeight` e `dir` ai blocchi di testo (predefiniti: `paragraph`, `heading`) |
| `withBlockClasses(nodes, classes, names?)`                                                                                          | Aggiunge `className` (solo dall'elenco) ai blocchi                                                                              |
| `classMarks(classes)`                                                                                                               | Mark `text_class`: un `<span class>` con una delle classi                                                                       |
| `textStyleKeymap(options?)`                                                                                                         | Allineamento (Maiusc+Mod+L/E/R/J) e rientro (Mod+] / Mod+[)                                                                     |
| `textStyleToolbarItems(schema, options?)`                                                                                           | Allineamento, rientri, colori e font in un colpo solo                                                                           |
| `alignmentMenu()`, `indentItems(options?)`, `colorItems(schema, options?)`, `fontItems(schema, options?)`                           | Controlli singoli                                                                                                               |
| `lineHeightMenu()`                                                                                                                  | Interlinea: tema predefinito e valori ammessi (1, 1.15, 1.5, 2)                                                                 |
| `directionItems()`                                                                                                                  | Pulsanti da sinistra a destra e da destra a sinistra (`dir-ltr`, `dir-rtl`)                                                     |
| `caseMenu(locale?)`, `changeCase(kind, locale?)`, `LETTER_CASES`                                                                    | minuscolo, MAIUSCOLO, Iniziali Maiuscole, Come in una frase                                                                     |
| `classFormatsMenu(schema, formats)`, `ClassFormat`                                                                                  | Menu Formato ▸ Stili con le tue classi (`kind: 'block'` o `'inline'`)                                                           |
| `setTextAlign`, `changeIndent`, `setLineHeight`, `setTextDirection`, `isAligned`, `hasLineHeight`, `hasTextDirection`, `MAX_INDENT` | Comandi e controlli sui blocchi                                                                                                 |
| `setMarkValue(type, attrs \| null)`, `markValue(state, type, attr)`                                                                 | Applica, toglie e legge un mark con valore                                                                                      |
| `setBlockClass(name \| null)`, `hasBlockClass`, `CLASS_NAME`                                                                        | Classi sui blocchi                                                                                                              |
| `defaultTextColors`, `defaultBackgroundColors`, `defaultFontFamilies`, `defaultFontSizes`                                           | Elenchi predefiniti (i colori del testo hanno contrasto almeno 4,5:1 su bianco)                                                 |
| `TextStyleOptions`, `ColorOption`                                                                                                   | `textColors`, `backgroundColors`, `fontFamilies`, `fontSizes`, `indent`                                                         |

### Opzioni (`TextStyleOptions`)

`textColors` e `backgroundColors` (`{ name, value }`: `name` è una chiave i18n per il nome accessibile), `fontFamilies` (`{ label, value }`), `fontSizes` (es. `'12pt'`) e `indent` (`{ more?, less? }`: comandi provati prima del rientro del blocco, ad esempio l'annidamento delle liste, così un solo paio di pulsanti e tasti serve a tutto).

## Tastiera

| Tasti                    | Azione                                                 |
| ------------------------ | ------------------------------------------------------ |
| Maiusc+Mod+L / E / R / J | Allinea a sinistra / al centro / a destra / giustifica |
| Mod+] / Mod+[            | Aumenta / riduce il rientro                            |

## Accessibilità

I menu mostrano nome, icona e scorciatoia di ogni voce e lo stato attivo (`isActive`); le caselle di colore hanno nome accessibile (`color.name.*`) e non si affidano solo al colore; i menu del font mostrano il valore corrente come un `select`.

## Sicurezza

Niente `style` libero (CLAUDE.md 5.4): colori solo `#rrggbb`/`rgb()`/nomi normalizzati, famiglie di font e lunghezze validate (`normalizeColor`, `normalizeFontFamily`, `normalizeLength`), interlinea e allineamento da liste chiuse. Le **classi** sono solo quelle che elenchi (`[a-z][a-z0-9-]{0,63}`, mai `scriba-...`; un elenco non valido lancia `RangeError`): ogni altra classe è scartata, quindi `MsoNormal` e simili incollati da Word non entrano mai. Usa gli stessi elenchi sul server con `@scriba/sanitize-server`. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
