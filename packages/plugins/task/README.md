# @scriba/plugin-task

Attività (to-do) dentro il documento: un blocco con titolo, casella "fatto" e scadenza. TinyMCE ha solo la lista di controllo (`checklist`, a pagamento); qui l'attività è un nodo con dati propri, esportabile in HTML e JSON.

```bash
pnpm add @scriba/plugin-task
```

## Uso

```ts
import { keymap } from '@scriba/core'
import { taskKeymap, taskNodes, taskSlashItem, taskToolbarItem } from '@scriba/plugin-task'

const schema = new Schema({ nodes: { ...basicSchemaSpec.nodes, ...taskNodes }, marks })

const plugins = [keymap(taskKeymap(), { priority: 70 })]
// toolbar: taskToolbarItem(schema)
// menu "/": taskSlashItem(schema) tra le voci di slashCommands
```

Il plugin definisce il **nodo e i comandi**; l'aspetto (casella, campi) è un _node view_ che scegli tu, ad esempio `vueNodeView(TaskView, { t })` di `@scriba/vue` (vedi `demo/main.ts`). Senza node view il nodo è comunque valido e si esporta.

## Esportazioni

| Nome                                                            | Cosa fa                                                                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskNodes`                                                     | Nodo `task`: blocco atomico con attributi `title`, `done`, `due`. HTML: `<div class="scriba-task" data-task data-done="false" data-due="2026-10-20">Titolo</div>` |
| `insertTask(schema, attrs?)`                                    | Comando: inserisce un'attività dopo il blocco corrente (al posto di un paragrafo vuoto) e la seleziona                                                            |
| `selectedTask(state)`                                           | L'attività selezionata come nodo, o `null`                                                                                                                        |
| `taskKeymap()`                                                  | Invio e Spazio sull'attività selezionata                                                                                                                          |
| `taskToolbarItem(schema)`                                       | Pulsante "Attività" (`id: 'task'`)                                                                                                                                |
| `taskSlashItem(schema)`                                         | Voce `/attività` (parole chiave: todo, task, attività, compito, checklist)                                                                                        |
| `leaveTask(view, pos)`                                          | Riseleziona l'attività e restituisce il focus all'editor (Esc nei suoi campi)                                                                                     |
| `isTaskTitle`, `isTaskDate`, `titleFromText`, `MAX_TITLE` (200) | Validazioni                                                                                                                                                       |
| `TaskAttrs`                                                     | `{ title, done, due }`                                                                                                                                            |

## Tastiera

Con l'attività selezionata: **Invio** sposta il focus nel primo campo del node view; **Spazio** attiva/disattiva "fatto"; le frecce la lasciano come al solito. Esc nei campi riporta alla selezione dell'attività (`leaveTask`).

## Sicurezza

Il titolo ha al massimo 200 caratteri su una riga, senza caratteri di controllo né segni di direzione (che potrebbero nascondere o riordinare il testo). La scadenza è una data reale `AAAA-MM-GG` (non `2026-02-30`); un valore non valido nell'HTML in ingresso diventa `null`, un `data-done` diverso da `true` è `false`. Tutto è testo e attributi tipizzati, mai HTML. Il server deve comunque ripassare l'HTML con `@scriba/sanitize-server`. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).
