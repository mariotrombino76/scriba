# @scriba/plugin-template

Modelli di documento come il plugin `template` di TinyMCE (`advtemplate` a pagamento): un dialogo con l'elenco dei modelli, descrizione, anteprima di sola lettura e "Inserisci". I modelli possono arrivare dal tuo server.

```bash
pnpm add @scriba/plugin-template
```

## Uso

```ts
import { templateToolbarItem, type TemplateOptions } from '@scriba/plugin-template'

const templateOptions: TemplateOptions = {
  locale: 'it-IT',
  values: { azienda: 'Ditta Esempio' }, // per i segnaposto {{azienda}}
  templates: [
    {
      title: 'Verbale di riunione',
      description: 'Titolo, data, partecipanti e decisioni.',
      content:
        '<h2>Verbale di riunione</h2><p><strong>Data:</strong> {{date}}</p><h3>Decisioni</h3><ol><li><p></p></li></ol>',
    },
    {
      title: 'Lettera',
      // caricato solo alla prima anteprima, ad esempio dal server
      content: () => fetch('/api/modelli/lettera').then((r) => r.text()),
    },
  ],
  // oppure templates: () => fetch('/api/modelli').then((r) => r.json())
}

// menu Inserisci o toolbar:
templateToolbarItem(t, templateOptions)
```

## Esportazioni

| Nome                                   | Cosa fa                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `templateToolbarItem(t, options)`      | Voce "Modello..." (`id: 'template'`); disattivata in sola lettura                           |
| `openTemplateDialog(view, t, options)` | Apre il dialogo da codice                                                                   |
| `TemplateOptions`                      | `templates` (elenco o funzione asincrona), `values?`, `locale?`                             |
| `Template`                             | `{ title, description?, content }`; `content` è HTML o una funzione asincrona che lo carica |
| `TemplateValue`                        | Testo, oppure funzione chiamata a ogni uso                                                  |
| `insertTemplate(fragment)`             | Comando: inserisce il contenuto nella selezione (un solo passo di undo)                     |
| `parseTemplate(schema, html, values?)` | HTML del modello trasformato in documento dello schema                                      |
| `fillPlaceholders(text, values)`       | Sostituisce i `{{nome}}` conosciuti; gli altri restano com'erano                            |
| `defaultTemplateValues(locale?)`       | I segnaposto predefiniti `{{date}}` e `{{time}}`                                            |
| `MAX_TEMPLATE_LENGTH`                  | 1 000 000 caratteri: oltre, il modello è rifiutato, non tagliato                            |

## Comportamento

I blocchi del modello mantengono il tipo (un titolo resta titolo): il paragrafo al cursore viene diviso, oppure sostituito se vuoto. In un documento vuoto, o con tutto selezionato, il modello diventa l'intero documento. Dove i blocchi non entrano (cella di tabella, codice) il contenuto è adattato come un incolla. I segnaposto `{{nome}}` (lettere, cifre, `_`, `.`, `-`) sono riempiti solo nei nodi di testo; `date` e `time` sono predefiniti, i tuoi `values` si aggiungono.

## Accessibilità

Il dialogo ha focus trap e restituisce il focus all'editor. I modelli sono un gruppo di radio (frecce) con la descrizione collegata (`aria-describedby`); l'anteprima è una regione con etichetta; caricamenti ed errori sono annunciati (`role="status"` e `role="alert"`).

## Sicurezza

- Il contenuto dei modelli può arrivare dal server: è **input non fidato**. L'HTML è letto in un documento inerte e passa dal parser dello schema (come un incolla); oltre `MAX_TEMPLATE_LENGTH` è rifiutato.
- I valori dei segnaposto sono inseriti **solo come testo**, mai come markup, anche se contengono `<` o `>`.
- Titolo e descrizione sono mostrati come testo. Una risposta lenta per un modello non più selezionato è ignorata, un caricamento fallito mostra un errore.
- Il server che salva i documenti deve comunque ripassarli da `@scriba/sanitize-server`.

Vedi [sicurezza](../../../docs/sicurezza.md), [accessibilità](../../../docs/accessibilita.md) e [plugin](../../../docs/plugin.md).
