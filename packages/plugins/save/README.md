# @scriba/plugin-save

Pulsante e scorciatoia "Salva" come nel plugin `save` di TinyMCE: chiama una funzione **tua**, che manda il documento al tuo backend. Il pulsante è attivo solo se c'è qualcosa da salvare.

```bash
pnpm add @scriba/plugin-save
```

## Uso

```ts
import { keymap } from '@scriba/core'
import { saveItem, saveKeymap, savePlugin, type SaveOptions } from '@scriba/plugin-save'

const saveOptions: SaveOptions = {
  save: async (doc) => {
    const res = await fetch('/api/documento', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: serializeHTML(doc),
    })
    if (!res.ok) throw new Error('Salvataggio non riuscito') // resta "non salvato"
  },
  onError: (error) => mostraAvviso(error),
}

const plugins = [
  savePlugin(),
  keymap(saveKeymap(saveOptions), { priority: 90 }), // più alta del "scarica" del menu File
]
// nella toolbar o nel menu File: saveItem(saveOptions)
```

## Esportazioni

| Nome                   | Cosa fa                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `savePlugin()`         | Ricorda l'ultimo documento salvato (o caricato)                                                          |
| `saveCommand(options)` | Comando: possibile solo se qualcosa è cambiato e non si sta già salvando                                 |
| `saveKeymap(options)`  | Ctrl/Cmd+S                                                                                               |
| `saveItem(options)`    | Pulsante "Salva" (`id: 'save'`), attivo solo con modifiche non salvate                                   |
| `isDirty(state)`       | `true` se il documento differisce dall'ultimo salvato                                                    |
| `isSaving(state)`      | `true` mentre la tua funzione è in corso                                                                 |
| `markSaved(view)`      | Segna il documento attuale come salvato (dopo aver caricato un documento nuovo o salvato con codice tuo) |
| `saveKey`              | `PluginKey` dello stato                                                                                  |
| `SaveOptions`          | `save(doc)` (può restituire una promise), `onError?(error)`                                              |

## Tastiera

Ctrl/Cmd+S salva e **non apre mai** il "Salva pagina" del browser, nemmeno quando non c'è nulla da salvare. Mentre `save` è in corso non si può salvare di nuovo; se lancia un errore o la promise è rifiutata il documento resta "non salvato" e viene chiamato `onError`.

## Sicurezza

L'editor non manda nulla da solo: l'invio avviene solo nella tua callback, verso il **tuo backend**. L'HTML ricevuto va **sempre** ripassato da `@scriba/sanitize-server` prima di essere salvato o mostrato, perché chiunque può chiamare l'API senza passare dall'editor. Vedi [sicurezza](../../../docs/sicurezza.md) e [plugin](../../../docs/plugin.md).

Per le bozze locali e le versioni vedi anche `@scriba/plugin-autosave` e [@scriba/plugin-revisions](../revisions/README.md).
