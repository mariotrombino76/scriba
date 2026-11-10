# @scriba/plugin-revisions

Cronologia delle versioni, come "Revision History" di TinyMCE (a pagamento): elenco delle versioni salvate, anteprima, confronto con il documento attuale (aggiunto in verde, tolto barrato in rosso) e ripristino con un solo passo annullabile.

```bash
pnpm add @scriba/plugin-revisions
```

## Uso

Le versioni le conserva il **tuo server**: il plugin chiede solo l'elenco e, quando l'utente ne sceglie una, il contenuto.

```ts
import { revisionsToolbarItem, type RevisionOptions } from '@scriba/plugin-revisions'

const revisionOptions: RevisionOptions = {
  locale: 'it',
  revisions: () => fetch('/api/versioni').then((r) => r.json()), // più recente per prima
  content: (revision) => fetch(`/api/versioni/${revision.id}`).then((r) => r.text()), // HTML o JSON
}

// nel menu File o nella toolbar:
revisionsToolbarItem(t, revisionOptions)
```

Una `Revision` ha la forma `{ id, createdAt, author?, label? }` (`createdAt` può essere `Date`, stringa ISO o timestamp).

## Esportazioni

| Nome                                                                                                                  | Cosa fa                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `revisionsToolbarItem(t, options)`                                                                                    | Pulsante "Cronologia versioni…"; disponibile anche in sola lettura (si può guardare e confrontare, "Ripristina" è disattivato) |
| `openRevisionDialog(view, t, options)`                                                                                | Apre il dialogo da codice e restituisce l'handle                                                                               |
| `RevisionOptions`                                                                                                     | `revisions()`, `content(revision)`, `locale?` (predefinito: quello del browser)                                                |
| `Revision`                                                                                                            | Tipo di una versione                                                                                                           |
| `parseRevision(schema, source)`                                                                                       | Legge il contenuto di una versione attraverso lo schema; lancia errore se lo schema la rifiuta                                 |
| `MAX_REVISION_LENGTH`                                                                                                 | 5 000 000 caratteri: un HTML più grande viene rifiutato, non tagliato                                                          |
| `formatRevisionDate(value, locale?)`                                                                                  | Data breve (stringa vuota se non valida)                                                                                       |
| `diffDocs(old, new)`, `diffSequence`, `slideEdits`, `MAX_COMPARISONS`, `DocDiff`, `Change`, `ChangeKind`, `Highlight` | Il confronto tra documenti, riusabile da solo                                                                                  |

## Come si usa il dialogo

Le versioni sono un gruppo di radio (frecce per muoversi); quella scelta si carica in un'anteprima di sola lettura. "Evidenzia le differenze con il documento attuale" mostra cosa è stato aggiunto o tolto _dopo_ quella versione, con "Differenza precedente/successiva" per scorrerle. "Ripristina questa versione" sostituisce il documento con un solo passo di undo.

## Accessibilità

Il dialogo ha focus trap e restituisce il focus all'editor. Caricamenti, errori e conteggio delle differenze sono in regioni `role="status"` / `role="alert"`; ogni differenza raggiunta con Precedente/Successiva è letta ("Differenza 2 di 5, aggiunto dopo: «...»", testo tagliato a 120 caratteri); dopo il ripristino un messaggio "Versione ripristinata" è annunciato.

## Sicurezza

- Il contenuto delle versioni arriva dal server ed è **input non fidato**: l'HTML è letto in un documento inerte e passa dal parser dello schema, il JSON è validato dallo schema (deve essere un documento intero); oltre `MAX_REVISION_LENGTH` viene rifiutato. Una versione illeggibile mostra un errore, non rompe l'editor.
- Autore ed etichetta sono mostrati **come testo**, mai come HTML.
- Una risposta lenta per una versione non più selezionata viene ignorata.
- Chi salva versioni deve comunque sanificarle sul server con `@scriba/sanitize-server`.

Vedi [sicurezza](../../../docs/sicurezza.md), [accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md). Si abbina bene a [@scriba/plugin-save](../save/README.md).
