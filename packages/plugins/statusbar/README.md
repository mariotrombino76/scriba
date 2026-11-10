# @scriba/plugin-statusbar

La barra di stato di TinyMCE: **percorso degli elementi** (`ul › li › p › strong`) e **maniglia per ridimensionare** l'editor. Non sono plugin dell'editor ma due elementi DOM che metti sotto l'editor; si affiancano al conteggio parole di [@scriba/plugin-word-count](../word-count/README.md).

```bash
pnpm add @scriba/plugin-statusbar
```

## Uso

```ts
import { createElementPath, createResizeHandle } from '@scriba/plugin-statusbar'
import { createWordCountStatus } from '@scriba/plugin-word-count'

const statusbar = document.createElement('div')
statusbar.className = 'scriba-statusbar'
statusbar.append(createElementPath(view, t).el, createWordCountStatus(view, t).el)
statusbar.append(createResizeHandle(view, t, { minHeight: 160 }).el)
editorContainer.after(statusbar)
```

Ogni funzione restituisce `{ el, destroy() }`: chiama `destroy()` quando togli la barra (rimuove anche l'ascolto sulla view).

## Esportazioni

| Nome                                    | Cosa fa                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `createElementPath(view, t)`            | `<nav>` con il percorso: prima i blocchi attorno al cursore (dal più esterno), poi i mark attivi nel cursore      |
| `elementPath(state)`                    | Lo stesso elenco come dati (`PathEntry`: `tag`, `pos`, con `pos` nullo per i mark)                                |
| `createResizeHandle(view, t, options?)` | Pulsante per cambiare l'altezza dell'editor                                                                       |
| `ResizeOptions`                         | `minHeight` (predefinito 120 px), `maxHeight` (predefinito nessun limite), `step` (predefinito 20 px per freccia) |
| `SIZED_CLASS`                           | Classe `scriba-sized` messa sull'editor quando ha un'altezza impostata (poi scorre all'interno)                   |

## Tastiera

**Percorso**: un solo punto di tabulazione (il blocco corrente, `aria-current="location"`); frecce Sinistra/Destra, Home e Fine si spostano tra i blocchi; clic o Invio su un blocco lo seleziona per intero e riporta il focus nel testo.

**Maniglia**: trascinamento con mouse, penna o tocco; frecce Su/Giù cambiano l'altezza di `step` pixel, Pag Su/Pag Giù di cinque volte tanto; doppio clic o Esc ridanno l'altezza naturale.

## Accessibilità

Il percorso è un `<nav>` con etichetta "Percorso dell'elemento" (`path.label`) e pulsanti con titolo "Seleziona {tag}"; la maniglia è un `<button>` con `aria-label` che spiega i tasti (`resize.label`), quindi è usabile solo con la tastiera.

## Note

- I nomi dei tag derivano da `toHTML` dello schema, validati con `^[a-z][a-z0-9-]*$` (altrimenti si usa il nome del nodo) e inseriti come testo.
- L'altezza è impostata via CSSOM (`el.style.height`), senza attributo `style`: compatibile con una CSP rigida.

Vedi [plugin](../../../docs/plugin.md) e [accessibilità](../../../docs/accessibilita.md).
