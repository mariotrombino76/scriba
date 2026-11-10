# @scriba-editor/sanitize-server

Sanificazione dell'HTML lato server (Node, senza DOM del browser) con **lo stesso schema** dell'editor Scriba.

```bash
pnpm add @scriba-editor/sanitize-server @scriba-editor/core
```

## Perché è obbligatorio

La pulizia fatta nel browser è una comodità, non una protezione: chiunque può mandare HTML
arbitrario alla tua API senza passare dall'editor. **Chi salva o mostra HTML ricevuto da un
client deve ripassarlo da questo pacchetto**, con lo stesso schema usato nell'editor, prima di
salvarlo e prima di mostrarlo.

## Uso

```ts
import { sanitizeHTML, InputTooLargeError } from '@scriba-editor/sanitize-server'
import { schema } from './schema.js' // lo stesso schema usato nel browser

app.post('/api/note', (req, res) => {
  try {
    const pulito = sanitizeHTML(schema, String(req.body.html ?? ''))
    salva(pulito)
    res.sendStatus(204)
  } catch (e) {
    if (e instanceof InputTooLargeError) return res.sendStatus(413)
    throw e
  }
})
```

L'HTML è letto con `parse5` come farebbe il browser (documento intero, scripting disabilitato) e
passa dal parser dello schema: tutto ciò che lo schema non conosce (`<script>`, attributi `on*`,
stili liberi, protocolli non ammessi, SVG…) viene scartato. L'output è poi riscritto dal
serializzatore, con escape di testo e attributi: non viene mai copiato dall'input.

Se salvi in **JSON**, sul server ricostruisci il documento con `schema.nodeFromJSON(json)`:
lancia un errore per tutto ciò che lo schema rifiuta.

## API

| Esportazione                                | Descrizione                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `sanitizeHTML(schema, html, options?)`      | Analizza l'HTML con lo schema e lo serializza di nuovo: restituisce una stringa pulita.        |
| `parseHTMLOnServer(schema, html, options?)` | Come sopra, ma restituisce il documento (`Node` di `@scriba-editor/core`) senza serializzarlo. |
| `SanitizeOptions`                           | Opzioni (vedi sotto).                                                                          |
| `InputTooLargeError`                        | Errore (`RangeError`) lanciato se l'input supera `maxInputLength`.                             |
| `adaptParse5(node)`                         | Espone un nodo `parse5` come `DOMLike` per il parser del core (uso avanzato).                  |

### Opzioni

| Opzione          | Default     | Significato                                                             |
| ---------------- | ----------- | ----------------------------------------------------------------------- |
| `maxInputLength` | `5_000_000` | Lunghezza massima dell'input in caratteri; oltre, `InputTooLargeError`. |
| `maxDepth`       | `256`       | Profondità massima di annidamento (da `HTMLParseOptions` del core).     |
| `maxNodes`       | `200_000`   | Numero massimo di nodi creati (da `HTMLParseOptions` del core).         |

Se superi `maxDepth` o `maxNodes` il parser lancia `HTMLLimitError` (esportato da `@scriba-editor/core`);
un input che non è una stringa lancia `TypeError`. Gestisci questi errori rispondendo con un
errore al client, senza salvare nulla.

## Note

- Usa **lo stesso schema** del browser (stessi nodi, mark e plugin): con uno schema più povero
  perderesti contenuto legittimo, con uno più ricco accetteresti ciò che l'editor non produce.
- Anche l'HTML serializzato dal documento di `documentFromYjs` (`@scriba-editor/collab-server`) va ripassato da qui prima
  di essere mostrato altrove.
- Questo pacchetto non sostituisce la validazione degli upload (tipo reale, dimensione,
  antivirus, niente SVG): vedi [Sicurezza](../../docs/sicurezza.md).

Guida completa e lista di controllo per chi integra: [Sicurezza](../../docs/sicurezza.md).
