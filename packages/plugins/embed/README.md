# @scriba-editor/plugin-embed

**Media** per l'editor Scriba: video (YouTube, Vimeo, Dailymotion), musica (Spotify), mappe
(Google Maps) e file video/audio. Corrisponde al plugin "Media" di TinyMCE, ma con una differenza di
fondo: si salva solo _quale servizio_ e _quale contenuto_, e l'indirizzo dell'`<iframe>` viene
sempre ricostruito dal plugin, mai copiato da ciò che incolli.

## Installazione

```bash
pnpm add @scriba-editor/plugin-embed
```

## Uso

```ts
import {
  embedKeymap,
  embedNodeView,
  embedNodes,
  embedPlugins,
  embedSlashItem,
  embedToolbarItem,
  mediaFileNodeView,
  mediaNodes,
  type MediaOptions,
} from '@scriba-editor/plugin-embed'

// l'upload dei file è una tua funzione: restituisce l'URL (https o relativo) dato dal server
const mediaOptions: MediaOptions = { upload: (file) => myServerUpload(file), maxSize: 50_000_000 }

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes, ...mediaNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [
    keymap(embedKeymap(t, mediaOptions), { priority: 70 }),
    ...embedPlugins(t, mediaOptions), // doppio clic su un media: apre la finestra
    // …
  ],
})

const view = new EditorView(el, {
  state,
  nodeViews: {
    embed: embedNodeView(t),
    video_file: mediaFileNodeView(t),
    audio_file: mediaFileNodeView(t),
  },
})

// menu Inserisci e menu slash
const item = embedToolbarItem(t, mediaOptions)
const slash = embedSlashItem(t, mediaOptions)
```

## Cosa esporta

| Export                                                                                             | Descrizione                                                                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `embedNodes`                                                                                       | Nodo `embed` (atomo di blocco): attributi `provider`, `ref`, `title`, `width`, `height`.                              |
| `mediaNodes`                                                                                       | Nodi `video_file` e `audio_file` (`<video controls>`, `<audio controls>`), attributo `src`.                           |
| `embedNodeView(t)`, `mediaFileNodeView(t)`                                                         | Node view: scheda con tipo, titolo e indirizzo (il player non viene caricato mentre scrivi); player reale per i file. |
| `embedKeymap(t, options?)`                                                                         | `Invio` su un media selezionato apre la finestra.                                                                     |
| `embedPlugins(t, options?)`                                                                        | Doppio clic su un media apre la finestra (solo se l'editor è modificabile).                                           |
| `embedToolbarItem(t, options?)`                                                                    | Voce "Media" (icona `video`).                                                                                         |
| `embedSlashItem(t, options?)`                                                                      | Voce slash ("/video", "/mappa", "/spotify"…).                                                                         |
| `openMediaDialog(view, t, options?)`                                                               | La finestra: un indirizzo (o il codice `<iframe>` del servizio) oppure un file da caricare.                           |
| `insertEmbed(attrs)`, `insertMediaFile(kind, src)`, `selectedMedia(state)`                         | Comandi e utilità.                                                                                                    |
| `embedFromAddress`, `embedFromPlayerUrl`, `playerUrl`, `pageUrl`, `isEmbedRef`, `EMBED_PROVIDERS`… | Lettura e costruzione degli indirizzi.                                                                                |
| `EMBED_SANDBOX`, `EMBED_REFERRER_POLICY`, `EMBED_FRAME_SRC`                                        | Costanti di sicurezza (vedi sotto).                                                                                   |
| `safeMediaUrl`, `mediaKindOf`, `mediaKindOfType`, `MEDIA_TYPES`                                    | Utilità per i file video/audio.                                                                                       |

Opzioni (`MediaOptions`): `upload(file) => Promise<string>` (senza, i file si possono solo
collegare per indirizzo) e `maxSize` in byte (default 100 MB, solo un aiuto per l'utente).

## Sicurezza

- **Whitelist di domini.** Sono ammessi solo YouTube (in modalità privacy `youtube-nocookie.com`),
  Vimeo, Dailymotion, Spotify e Google Maps, e solo i loro indirizzi di player esatti, in `https`.
  Qualunque altro `<iframe>` (anche incollato o caricato) viene scartato.
- **`sandbox` fisso.** L'iframe esce sempre con `sandbox="allow-scripts allow-same-origin allow-presentation"`,
  `referrerpolicy="strict-origin-when-cross-origin"` e `loading="lazy"`: mai letti dall'input.
- **Riferimenti validati** (id, formato) con espressioni rigide; titolo senza caratteri di
  controllo (max 200), larghezza e altezza entro limiti fissi.
- **File video/audio:** solo indirizzi `https` o relativi (mai `data:`, `blob:`, `javascript:`);
  `controls` sempre attivo; autoplay, loop, poster e ogni altro attributo vengono scartati.
- **CSP.** Le pagine che mostrano l'HTML salvato devono ammettere i servizi in `frame-src`
  (`EMBED_FRAME_SRC`) e, per i file, l'origine in `media-src`. L'editor stesso non carica i player.
- **Upload:** il controllo del tipo e della dimensione nel browser è solo un aiuto; il server deve
  verificare tipo reale, dimensione e contenuto.
- L'HTML in ingresso passa comunque dal parser dello schema. Vedi [sicurezza](../../../docs/sicurezza.md)
  e [plugin](../../../docs/plugin.md).

## Accessibilità

La scheda nell'editor ha `role="img"` con un'etichetta (es. tipo e titolo); l'iframe esportato ha
sempre un `title` (il titolo, o il nome del servizio). I file hanno controlli nativi con etichetta.
La finestra ha focus trap e restituisce il focus all'editor. Vedi
[accessibilità](../../../docs/accessibilita.md).
