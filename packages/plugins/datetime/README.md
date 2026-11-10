# @scriba/plugin-datetime

Menu **Data/ora** per l'editor Scriba: inserisce la data o l'ora correnti nel formato scelto.
Come il plugin "Insert date/time" di TinyMCE, con le stesse quattro scelte di partenza.

## Installazione

```bash
pnpm add @scriba/plugin-datetime
```

## Uso

```ts
import { dateTimeMenu } from '@scriba/plugin-datetime'

menubar.menus = [
  {
    id: 'insert',
    label: 'menu.insert',
    items: [dateTimeMenu() /* oppure dateTimeMenu({ locale: 'it-IT' }) */],
  },
]
```

Il menu mostra una voce per formato, con la data o l'ora **calcolate nel momento in cui il menu si
apre**.

## Opzioni (`DateTimeOptions`)

| Opzione   | Default                                                   | Descrizione                              |
| --------- | --------------------------------------------------------- | ---------------------------------------- |
| `locale`  | lingua `lang` della pagina, altrimenti quella del browser | Lingua dei formati.                      |
| `formats` | ora, data ISO, data estesa, data breve                    | Elenco di `DateTimeFormat`, nell'ordine. |
| `now`     | `() => new Date()`                                        | L'orologio (utile nei test).             |

Un `DateTimeFormat` è un oggetto di opzioni di `Intl.DateTimeFormat` (es. `{ dateStyle: 'long' }`)
oppure `'iso-date'` (`2026-10-19`) oppure `'iso-time'` (`14:05:09`). `DEFAULT_FORMATS` contiene
`{ timeStyle: 'medium' }`, `'iso-date'`, `{ dateStyle: 'long' }`, `{ dateStyle: 'short' }`.

## Cosa esporta

- `dateTimeMenu(options?)`: il menu (`id: 'datetime'`, icona `clock`, etichetta i18n `datetime.label`).
- `formatDateTime(date, format, locale?)`: una data come testo (ora locale).
- `insertText(text)`: comando che scrive il testo al cursore, sostituendo la selezione.
- `DEFAULT_FORMATS`, `DateTimeFormat`, `DateTimeOptions`.

## Note

- Il testo è inserito come **testo semplice** (nessun elemento `<time>`), come il comportamento
  predefinito di TinyMCE; funziona in qualunque testo, anche nel codice.
- Non agisce se il cursore non è in un blocco di testo.
- Sicurezza: si scrive solo testo generato dal browser, nessun HTML. Vedi
  [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
