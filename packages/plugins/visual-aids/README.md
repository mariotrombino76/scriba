# @scriba-editor/plugin-visual-aids

Aiuti visivi di TinyMCE: **Mostra blocchi** (`visualblocks`) e **Mostra caratteri invisibili** (`visualchars`). Servono solo durante la scrittura e **non finiscono mai nell'HTML**.

```bash
pnpm add @scriba-editor/plugin-visual-aids
```

## Uso

```ts
import { visualAids, visualAidsItems } from '@scriba-editor/plugin-visual-aids'

const plugins = [
  visualAids(), // oppure visualAids({ blocks: true })
]
// nel menu Visualizza: ...visualAidsItems()
```

## Esportazioni

| Nome                                    | Cosa fa                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visualAids(initial?)`                  | Plugin: tiene lo stato, mette la classe sull'editor ed evidenzia i caratteri. `initial` è un `Partial<VisualAids>` (tutto spento di default)                                   |
| `visualAidsItems()`                     | Due pulsanti per il menu Visualizza: `visual-blocks` ("Mostra blocchi") e `visual-chars` ("Mostra caratteri invisibili"), con stato attivo e disponibili anche in sola lettura |
| `toggleVisualBlocks`                    | Comando: mostra o nasconde i contorni dei blocchi                                                                                                                              |
| `toggleVisualChars`                     | Comando: mostra o nasconde spazi non separabili e trattini morbidi                                                                                                             |
| `getVisualAids(state)`, `visualAidsKey` | Stato corrente (`{ blocks, chars }`)                                                                                                                                           |
| `SHOW_BLOCKS_CLASS`                     | Classe `scriba-show-blocks` sull'editor: il tema disegna i blocchi                                                                                                             |
| `VisualAids`                            | Tipo dello stato                                                                                                                                                               |

## Come funziona

- **Blocchi**: l'editor riceve la classe `scriba-show-blocks`; contorni e nomi dei blocchi sono disegnati dal CSS del tema (`@scriba-editor/themes`).
- **Caratteri**: spazio non separabile (U+00A0), spazio non separabile stretto (U+202F) e trattino morbido (U+00AD) sono evidenziati con decorazioni (`scriba-char-nbsp`, `scriba-char-shy`); sono calcolati una volta per documento.

## Accessibilità

I pulsanti riportano lo stato attivo (`isActive`) come ogni voce della toolbar e si usano da tastiera. Le decorazioni sono solo visive: non cambiano il testo né ciò che leggono gli assistivi.

## Note

Nulla viene scritto nel documento né nell'HTML esportato, quindi non c'è impatto sulla sicurezza dei dati. Vedi [plugin](../../../docs/plugin.md).
