# @scriba/plugin-format-painter

Il **pennello formato** per l'editor Scriba: copia la formattazione di un testo e la applica a un
altro, come il "Format painter" di TinyMCE e di Word.

```bash
pnpm add @scriba/plugin-format-painter
```

## Uso

```ts
import { keymap } from '@scriba/core'
import {
  formatPainter,
  formatPainterItem,
  formatPainterKeymap,
} from '@scriba/plugin-format-painter'

// nello stato dell'editor
plugins: [formatPainter(t), keymap(formatPainterKeymap(), { priority: 85 })]

// nel menu Formato o nella barra degli strumenti
const item = formatPainterItem()
```

## Come si usa

1. Metti il cursore (o seleziona) nel testo di cui vuoi copiare l'aspetto.
2. Premi il pulsante "Pennello formato" (o Ctrl/Cmd+Alt+C per copiare soltanto).
3. Clicca una parola o seleziona un testo: riceve la stessa formattazione, **in un solo passo
   annullabile**. Con il cursore in una parola, formatta quella parola (o il testo digitato dopo).
4. Esc, o il pulsante premuto di nuovo, smette di aspettare senza cambiare niente.

Si copiano i _mark_ di formattazione (grassetto, corsivo, colori, font…) e l'aspetto del blocco
(allineamento, rientro, interlinea, direzione, classe). Un paragrafo può diventare titolo e
viceversa. I link e i commenti **non** vengono copiati né rimossi dal testo di destinazione.

## Opzioni (`formatPainter(t, options?)`)

| Opzione      | Descrizione                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `marks`      | `(type) => boolean`: quali mark si copiano (default `isFormattingMark` di `@scriba/ui`).                                                        |
| `blockAttrs` | Attributi del blocco copiati, se entrambi i blocchi li hanno (default `align`, `indent`, `lineHeight`, `dir`, `className`). Mai `id`/`blockId`. |
| `blockTypes` | Tipi di blocco che possono trasformarsi l'uno nell'altro (default `paragraph`, `heading`).                                                      |

## Esportazioni

| Nome                                                 | Cosa fa                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `formatPainter(t, options?)`                         | Il plugin (stato, area per i lettori di schermo, click del mouse).                                           |
| `formatPainterKeymap()`                              | Scorciatoie (vedi sotto).                                                                                    |
| `formatPainterItem()`                                | Pulsante, `aria-pressed` mentre aspetta il testo da formattare.                                              |
| `copyFormat`, `pasteFormat`                          | Comandi: copia / applica il formato.                                                                         |
| `toggleFormatPainter`, `cancelFormatPainter`         | Comandi: attiva o disattiva l'attesa.                                                                        |
| `isFormatPainterArmed(state)`, `copiedFormat(state)` | Stato corrente.                                                                                              |
| `formatPainterKey`, `PAINTING_CLASS`                 | Chiave del plugin e classe `scriba-format-painting` sull'editor mentre aspetta (il tema imposta il cursore). |

## Scorciatoie

| Tasto          | Azione                           |
| -------------- | -------------------------------- |
| Ctrl/Cmd+Alt+C | Copia la formattazione           |
| Ctrl/Cmd+Alt+V | Applica la formattazione copiata |
| Esc            | Smette di aspettare              |

## Accessibilità

Il pulsante ha `aria-pressed`; una regione `status` nascosta annuncia "attivo" e "disattivato", e
tutto è raggiungibile da tastiera (copia/applica) senza il mouse. Il pulsante e le scorciatoie non
cambiano il testo, solo i mark e gli attributi consentiti dallo schema: niente stili liberi. Vedi
[accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
