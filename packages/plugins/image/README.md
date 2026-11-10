# @scriba/plugin-image

Immagini per l'editor Scriba: inserimento da file (tramite **una tua funzione di upload**) o da
indirizzo, trascinamento e incolla, ridimensionamento, testo alternativo, allineamento e
**modifica foto** (ritaglio, rotazione, riflessione, luminosità, contrasto, saturazione). Come il
plugin immagini di TinyMCE e il suo editor immagini.

```bash
pnpm add @scriba/plugin-image
```

## Uso

```ts
import {
  imageContextMenu,
  imageKeymap,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  imageEditToolbarItems,
  type ImageUploadOptions,
} from '@scriba/plugin-image'

// Un'app vera invia il file al proprio server e restituisce l'URL pubblico.
const images: ImageUploadOptions = {
  maxSize: 5 * 1024 * 1024,
  upload: async (file) => {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body })
    if (!res.ok) throw new Error('upload fallito')
    const { url } = await res.json()
    return url // oppure { src: url, alt: 'Descrizione' }
  },
}

// schema: nodes: { ...basicSchemaSpec.nodes, ...imageNodes }
// stato dell'editor
plugins: [...imagePlugins(t, images), keymap(imageKeymap(t, images), { priority: 70 })]

// pulsanti e menu contestuale (clic destro su un'immagine)
const items = [...imageToolbarItems(schema, t, images), ...imageEditToolbarItems(t, images)]
const menu = imageContextMenu(schema, t, images)
```

## Opzioni (`ImageUploadOptions`)

| Opzione   | Descrizione                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload`  | `(file: File) => Promise<string \| { src: string; alt?: string }>`: carica il file e restituisce l'URL. Senza, trascinamento e incolla di file non fanno nulla e la finestra accetta solo un indirizzo. |
| `accept`  | Tipi MIME accettati (default `image/png`, `image/jpeg`, `image/gif`, `image/webp`). **SVG è rifiutato** salvo che tu lo aggiunga.                                                                       |
| `maxSize` | Dimensione massima in byte (default 10 MB).                                                                                                                                                             |

## Nodo e comportamento

Il nodo `image` è inline e atomico, con `src`, `alt`, `width` (16–4000 px) e `align` (`left`,
`center`, `right`). `alt` assente = "da descrivere" (il controllo accessibilità lo segnala);
`alt=""` = immagine decorativa.

- **Inserimento**: pulsante, o file trascinato o incollato; il dialogo ha selezione file con zona di
  rilascio (solo con `upload`), indirizzo, testo alternativo o "decorativa", larghezza, allineamento.
- **Upload**: la posizione di inserimento segue le modifiche fatte nel frattempo; stato ed errori
  sono annunciati.
- **Ridimensionamento**: maniglie sui lati dell'immagine selezionata (solo con il puntatore; da
  tastiera si imposta la larghezza nel dialogo).
- **Modifica**: doppio clic o Invio su un'immagine selezionata apre il dialogo.
- **Modifica foto** (`imageEditToolbarItems`, visibile solo con un'immagine selezionata):
  ruota, rifletti, ritaglia (libero, originale, 1:1, 4:3, 16:9), luminosità/contrasto/saturazione da
  -100 a 100. Il risultato è un nuovo file (JPEG e WebP restano tali, PNG e GIF diventano PNG) passato
  alla tua `upload`; **senza `upload` diventa un URL `data:`** entro il limite dello schema. È un
  solo passo annullabile. Un'immagine di un altro sito si può modificare solo se quel sito consente
  CORS.

## Esportazioni

| Nome                                                                                        | Cosa fa                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `imageNodes`, `alignStyle`, `MIN_WIDTH`, `MAX_WIDTH`, `ImageAlign`                          | Il nodo e le costanti.                            |
| `imagePlugins(t, options)`                                                                  | Drop, incolla file, maniglie, doppio clic.        |
| `imageKeymap(t, options)`                                                                   | Invio su un'immagine selezionata apre il dialogo. |
| `imageToolbarItems(schema, t, options)`                                                     | Pulsante "Immagine" (inserisce o modifica).       |
| `imageEditToolbarItems(t, options)`                                                         | Pulsante "Modifica foto".                         |
| `imageContextMenu(schema, t, options)`                                                      | Sezione del menu contestuale.                     |
| `openImageDialog`, `openImageEditor`, `selectedImage`                                       | Dialoghi da codice.                               |
| `uploadImages`, `validateImageFile`, `formatSize`, `DEFAULT_ACCEPT`, `DEFAULT_MAX_SIZE`     | Caricamento e controlli.                          |
| `rotate`, `flip`, `aspectCrop`, `editMatrix`, `outputSize`, `adjustPixels`, `outputType`, … | Funzioni della modifica foto.                     |

## Sicurezza

- **Il caricamento è una tua callback**: l'editor non carica nulla da solo.
- Il controllo del tipo MIME e della dimensione nel browser è **solo un aiuto per l'utente**. La
  validazione vera spetta al server: tipo reale dai _magic bytes_, dimensione, antivirus se serve.
  Se abiliti l'SVG, va sanificato lato server e servito con `Content-Type` e `Content-Disposition`
  corretti.
- `src` è controllato dalla whitelist di URL dove il nodo viene creato (HTML, JSON, collaborazione):
  `http(s)`, relativi, oppure `data:` raster (`png`, `jpeg`, `gif`, `webp`) entro il limite di
  dimensione; **mai `image/svg+xml`**. L'URL restituito dalla tua `upload` passa dallo stesso
  controllo e, se rifiutato, l'inserimento fallisce con un errore annunciato.
- Larghezza e allineamento sono attributi tipizzati (allineamento con valori enumerati), mai `style`
  libero.

L'HTML salvato va ripassato da `@scriba/sanitize-server`: vedi
[sicurezza](../../../docs/sicurezza.md).

## Accessibilità

Dialoghi modali con focus trap e ritorno del focus; messaggi ("Caricamento…", errori, esito)
in una regione `status` polite; testo alternativo o "decorativa" richiesti nel dialogo; tutta la
modifica foto è raggiungibile da tastiera. Vedi [accessibilità](../../../docs/accessibilita.md) e
[plugin](../../../docs/plugin.md).
