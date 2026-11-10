# @scriba-editor/plugin-permissions

Permessi per blocco: alcuni blocchi (paragrafi, titoli, tabelle, ...) possono essere resi non modificabili per l'utente corrente. TinyMCE ha solo `contenteditable="false"` a mano, senza regole né controllo lato server.

```bash
pnpm add @scriba-editor/plugin-permissions
```

## Uso

```ts
import { blockPermissions, withBlockIds } from '@scriba-editor/plugin-permissions'

// 1. gli id dei blocchi nello schema (data-block-id in HTML)
const schema = new Schema({
  nodes: withBlockIds({ ...basicSchemaSpec.nodes, ...tableNodes }),
  marks,
})

// 2. il plugin: canEdit decide per id (qui: gli id che iniziano con "lock")
const plugins = [...blockPermissions({ canEdit: (id) => !id.startsWith('lock'), t })]
```

Gli id li assegni tu nell'HTML che carichi (`<p data-block-id="lock-intro">`): un blocco senza id è sempre modificabile. Se i permessi cambiano, chiama `view.updateState(view.state)` per aggiornare i blocchi segnati.

## Esportazioni

| Nome                                                                                                                  | Cosa fa                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `withBlockIds(nodes, names?)`                                                                                         | Aggiunge l'attributo `blockId` ai tipi indicati (predefiniti: `DEFAULT_BLOCK_TYPES`)                                               |
| `DEFAULT_BLOCK_TYPES`                                                                                                 | `paragraph`, `heading`, `blockquote`, `bullet_list`, `ordered_list`, `list_item`, `code_block`, `table`                            |
| `blockPermissions(options)`                                                                                           | Plugin: rifiuta le modifiche ai blocchi protetti e le annuncia                                                                     |
| `checkBlockEdits(before, after, rules)`                                                                               | Controllo **lato server**: restituisce gli id modificati, cancellati o aggiunti (vuoto = permesso)                                 |
| `transactionAllowed(tr, rules)`                                                                                       | Dice se una transazione lascia intatti i blocchi protetti                                                                          |
| `BLOCK_ID`, `blockIdOf(node)`, `isBlockId(v)`                                                                         | Nome dell'attributo, lettura e validazione dell'id (1-100 caratteri: lettere, cifre, `_ - . :`)                                    |
| `LOCKED_CLASS`                                                                                                        | Classe `scriba-locked` messa sul DOM dei blocchi protetti                                                                          |
| `deleteKeepingLocked`, `deleteSelectionKeepingLocked`, `typeKeepingLocked`, `pasteKeepingLocked`, `marksAroundLocked` | Elementi di base usati dal plugin: in una selezione mista cancellano, scrivono, incollano e formattano solo ciò che è modificabile |
| `BlockRules`, `CanEdit`, `BlockPermissionOptions`                                                                     | Tipi                                                                                                                               |

### Opzioni (`BlockPermissionOptions`)

- `canEdit(id)`: se l'utente può modificare il blocco.
- `t`: funzione di traduzione.
- `allowMarks`: mark ammessi anche sul testo protetto (predefinito `['comment']`, così si può ancora commentare).
- `trusted(tr)`: modifiche applicate comunque (predefinito: modifiche remote di `@scriba-editor/plugin-collab`, che il server di collaborazione verifica con la stessa regola).
- `onRefused(tr)`: chiamata quando una modifica è rifiutata.

## Comportamento e accessibilità

Il blocco protetto è segnato con la classe `scriba-locked`; il cursore può entrarci (leggere, selezionare, copiare, commentare), ma ogni modifica viene rifiutata. Il rifiuto è annunciato in una regione `role="status"`: "Questo blocco è protetto: non puoi modificarlo". Con Backspace/Canc su una selezione mista si cancella solo il testo modificabile. Gli id incollati non vengono portati con sé, e se un blocco con id si divide o si copia l'id resta alla copia con più testo.

## Sicurezza

I permessi nel client sono **una comodità per utenti onesti**: chiunque può inviare al backend un documento modificato saltando l'editor. Il server deve applicare la stessa regola, ad esempio:

```ts
const changed = checkBlockEdits(docPrima, docDopo, { canEdit })
if (changed.length) throw new Error(`Blocchi protetti modificati: ${changed.join(', ')}`)
```

Vedi [sicurezza](../../../docs/sicurezza.md) (5.1 e 5.8) e [plugin](../../../docs/plugin.md).
