# Concetti

Per usare Scriba con i componenti pronti non serve sapere come funziona dentro. Questa pagina è
per chi scrive plugin o comandi, o vuole capire perché l'editor si comporta così.

## In parole semplici: una casa di LEGO

1. **Lo schema** è il manuale: dice quali mattoncini esistono (paragrafo, titolo, elenco, tabella,
   immagine…) e dove possono stare (una cella sta in una riga, una riga in una tabella).
2. **Il documento** è la costruzione: un albero di nodi che rispetta sempre il manuale. Non si
   modifica mai sul posto: ogni cambiamento produce un documento nuovo.
3. **Una transazione** è una mossa: "togli questo mattoncino, metti quest'altro". Siccome il
   documento vecchio resta intatto, tornare indietro (annulla) o combinare le mosse di due persone
   (collaborazione) è semplice.
4. **La view** è la vetrina: mostra il documento nella pagina e trasforma tasti, incolla e
   trascinamenti in transazioni.
5. **I plugin** sono kit di espansione: aggiungono mattoncini, mosse, pulsanti e scorciatoie
   senza toccare il resto.

Una conseguenza importante: l'HTML che esce da Scriba è **sempre valido e prevedibile**, perché
nasce dal documento, non dal DOM della pagina. Tutto quello che lo schema non conosce
(`<script>`, attributi `onclick`, stili liberi…) semplicemente non può entrare.

## Schema

```ts
import { Schema, basicSchemaSpec } from '@scriba-editor/core'
import { tableNodes } from '@scriba-editor/plugin-table'
import { linkMarks } from '@scriba-editor/plugin-link'

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...tableNodes },
  marks: { ...linkMarks, ...basicSchemaSpec.marks },
})
```

- **Nodi**: blocchi (`paragraph`, `heading`, `table`…) e inline (`text`, `image`, `hard_break`).
  Ognuno dichiara il contenuto ammesso (`content: 'inline*'`, `'block+'`…), gli attributi con un
  validatore e come si legge da HTML (`parseHTML`) e si scrive (`toHTML`).
- **Mark**: formattazioni sul testo (`bold`, `italic`, `link`, colori…), separate dai nodi.
- **Attributi tipizzati**: niente `style` libero. Un colore è un attributo validato (`#rrggbb`,
  `rgb()`, nomi da lista), un URL passa dalla whitelist dei protocolli.

## Documento e posizioni

Il documento è un albero immutabile. Ogni punto ha una **posizione** intera: si contano i
caratteri e i confini dei nodi. In `<p>ab</p>` la posizione 0 è prima del paragrafo, 1 prima di
"a", 3 dopo "b", 4 dopo il paragrafo.

Quando una transazione cambia il documento, le posizioni si spostano: la **mappatura** dice dove
finisce una posizione dopo la modifica (come un segnalibro che segue il testo). Così il cursore,
i commenti e i cursori degli altri utenti restano al posto giusto.

## Transazioni e step

```ts
const tr = view.state.tr.insertText('Ciao', 1).addMark(1, 5, schema.mark('bold'))
view.dispatch(tr)
```

Una transazione è una lista di **step** atomici e invertibili (`ReplaceStep`, `AddMarkStep`,
`RemoveMarkStep`, `SetAttrsStep`…). Su questo si basano annulla/ripeti (con raggruppamento
temporale della digitazione) e la collaborazione. Dopo ogni transazione il documento viene
**normalizzato** allo schema (es. una tabella con righe di lunghezza diversa viene completata).

## Comandi

Un comando è una funzione `(state, dispatch?, view?) => boolean`:

- con `dispatch` esegue la modifica;
- **senza** `dispatch` risponde solo "si può fare?": è così che i pulsanti si abilitano e
  disabilitano da soli.

```ts
import { toggleMark } from '@scriba-editor/core'

const grassetto = toggleMark(schema.marks.bold!)
grassetto(view.state) // true se applicabile qui
grassetto(view.state, view.dispatch) // applica
```

## Plugin e scorciatoie

Un plugin può tenere uno stato proprio, filtrare o aggiungere transazioni, fornire decorazioni
(evidenziazioni solo visive) e, lato view, reagire a incolla, trascinamento, doppio clic.
Le scorciatoie sono mappe `{ 'Mod-b': comando }` messe in un plugin con `keymap(...)`, con
priorità: la più alta risponde per prima (`Mod` è Ctrl, o ⌘ su macOS).

## View

La view usa un `contentEditable` **controllato**: intercetta `beforeinput` e trasforma ogni
modifica in una transazione invece di lasciar fare al browser. Gestisce la composizione IME
(cinese, giapponese, tastiere Android), sincronizza la selezione nei due sensi e aggiorna solo i
blocchi cambiati.

## Interfaccia

`@scriba-editor/ui` fornisce Web Components accessibili: `<scriba-toolbar>`, `<scriba-menubar>`, menu,
dialog e il menu del tasto destro. Parlano con l'editor solo tramite comandi pubblici, quindi
funzionano con qualsiasi framework (o senza).
