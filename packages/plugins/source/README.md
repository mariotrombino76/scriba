# @scriba-editor/plugin-source

Vista del codice sorgente HTML, come il pulsante "Source code" di TinyMCE: si apre un dialogo con l'HTML del documento, lo si modifica e si salva di nuovo nel documento (un solo passo di undo).

```bash
pnpm add @scriba-editor/plugin-source
```

## Uso

```ts
import { sourceToolbarItem } from '@scriba-editor/plugin-source'

// nella toolbar o nel menu Strumenti
sourceToolbarItem(t)
// con limiti propri
sourceToolbarItem(t, { maxLength: 500_000, parse: {/* HTMLParseOptions del core */} })
```

## Esportazioni

| Nome                                  | Cosa fa                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `sourceToolbarItem(t, options?)`      | Pulsante "Codice sorgente" (`id: 'source'`); disponibile anche in sola lettura                                               |
| `openSourceDialog(view, t, options?)` | Apre il dialogo da codice e restituisce l'handle                                                                             |
| `documentSource(doc)`                 | HTML del documento dal serializzatore, un blocco di primo livello per riga                                                   |
| `parseSource(view, html, options?)`   | Legge l'HTML modificato come ogni input non fidato; lancia `HTMLLimitError` oltre i limiti                                   |
| `SourceOptions`                       | `maxLength` (predefinito `DEFAULT_MAX_SOURCE_LENGTH` = 2 000 000 caratteri), `parse` (limiti di profondità e numero di nodi) |

## Accessibilità

Il dialogo ha focus trap e restituisce il focus all'editor; l'area di testo ha etichetta e descrizione (`aria-describedby`), e se l'HTML supera i limiti compare un messaggio in una regione `aria-live` con `aria-invalid` sull'area. In sola lettura si vede il codice ma "Salva" è disattivato e l'area è `readOnly`.

## Sicurezza

L'HTML scritto qui è **input non fidato**, come un incolla:

- è letto in un **documento inerte** (`DOMParser`, con la policy Trusted Types), mai con `innerHTML` nel documento attivo;
- poi passa dal **parser dello schema**, che scarta ciò che non conosce (`<script>`, `<style>`, handler `on*`, URL non ammessi, attributi sconosciuti);
- ci sono limiti di lunghezza e di annidamento (profondità e numero di nodi): oltre, il salvataggio è rifiutato con un messaggio.

Il sorgente mostrato è quello del serializzatore (con escape), non una copia del DOM. Questo non sostituisce il controllo lato server: ripassa sempre l'HTML con `@scriba-editor/sanitize-server` prima di salvarlo. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
