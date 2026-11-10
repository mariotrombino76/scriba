# @scriba/plugin-find-replace

Trova e sostituisci per l'editor Scriba, con evidenziazione dei risultati nel testo, ricerca con
maiuscole/minuscole, parola intera ed **espressioni regolari**. Come il plugin "Search and
Replace" di TinyMCE, ma con le regex eseguite in modo sicuro (vedi sotto).

```bash
pnpm add @scriba/plugin-find-replace
```

## Uso

```ts
import { keymap } from '@scriba/core'
import {
  findReplaceKeymap,
  findReplacePlugins,
  findReplaceToolbarItem,
} from '@scriba/plugin-find-replace'

// nello stato dell'editor
plugins: [...findReplacePlugins(), keymap(findReplaceKeymap(t), { priority: 80, readOnly: true })]

// nella barra degli strumenti o nel menu Modifica
const find = findReplaceToolbarItem(t)
```

Il keymap va registrato con `readOnly: true`: la ricerca funziona anche in sola lettura (la
sostituzione resta disattivata).

## Esportazioni

| Nome                                                                                          | Cosa fa                                                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `findReplacePlugins()`                                                                        | Stato e decorazioni dei risultati evidenziati.                    |
| `findReplaceKeymap(t, options?)`                                                              | Ctrl/Cmd+F apre il pannello (al posto della ricerca del browser). |
| `findReplaceToolbarItem(t, options?)`                                                         | Pulsante "Trova e sostituisci" (icona di ricerca).                |
| `openFindPanel`, `FindPanel`                                                                  | Il pannello, apribile da codice.                                  |
| `SearchRunner`, `WORKER_POLICY`                                                               | Esegue le ricerche (le regex in un Web Worker).                   |
| `compileQuery`, `searchTexts`, `expandReplacement`, `MAX_QUERY_LENGTH`, `DEFAULT_MAX_MATCHES` | Il motore di ricerca, funzioni pure su stringhe.                  |
| `findKey`, `getFindState`, `blockTexts`, `toMatches`                                          | Accesso allo stato dei risultati.                                 |

`options` (`FindReplaceOptions`):

| Opzione        | Descrizione                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `timeout`      | Tempo massimo di una ricerca con regex, in ms (default 1000).                    |
| `maxMatches`   | Risultati massimi riportati (default 10 000).                                    |
| `createWorker` | Fabbrica di worker personalizzata, se il tuo bundler richiede un'altra sintassi. |

## Pannello

Finestra **non modale**: il documento resta visibile e modificabile. Campi "Trova" e "Sostituisci",
opzioni (maiuscole/minuscole, parola intera, espressione regolare), pulsanti precedente/successivo,
sostituisci e sostituisci tutto.

| Tasto                         | Azione                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| Ctrl/Cmd+F                    | Apre (o porta il focus sul) pannello                             |
| Invio / Maiusc+Invio          | Risultato successivo / precedente (nel campo "Trova")            |
| Invio nel campo "Sostituisci" | Sostituisce il risultato corrente                                |
| Esc                           | Chiude il pannello e seleziona nell'editor il risultato corrente |

Nelle regex, nella sostituzione valgono `$&` (tutta la corrispondenza), `$1`…`$99` (gruppi) e `$$`
(un dollaro). Nel testo semplice la sostituzione è letterale.

## Sicurezza

Una regex scritta dall'utente può essere "catastrofica" e bloccare la pagina (ReDoS). Per questo:

- il testo semplice è sempre cercato come stringa con escape (tempo lineare);
- le espressioni regolari girano in un **Web Worker** che viene terminato allo scadere del tempo
  limite (`timeout`): l'utente vede un messaggio e la pagina non si blocca;
- la lunghezza della ricerca è limitata a 500 caratteri e i risultati a `maxMatches`;
- le corrispondenze vuote vengono ignorate (`a*` non cicla all'infinito).

Se la tua CSP ha una direttiva `trusted-types`, consenti la policy `scriba-worker`; se i worker non
sono utilizzabili, le ricerche con regex non partono (viene mostrato un messaggio) mentre il testo
semplice continua a funzionare. Vedi [sicurezza](../../../docs/sicurezza.md).

## Accessibilità

Il numero di risultati ("3 di 12") è in una regione `status` collegata al campo con
`aria-describedby`; il pannello ha titolo e campi etichettati, è usabile da tastiera e Esc riporta
il focus nell'editor. Vedi [accessibilità](../../../docs/accessibilita.md) e
[plugin](../../../docs/plugin.md).
