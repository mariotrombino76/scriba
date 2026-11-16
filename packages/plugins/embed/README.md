**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-embed

**Media** for the Scriba editor: videos (YouTube, Vimeo, Dailymotion), music (Spotify), maps
(Google Maps) and video/audio files. It matches TinyMCE's "Media" plugin, with one fundamental
difference: only _which service_ and _which content_ are saved, and the `<iframe>` address is
always rebuilt by the plugin, never copied from what you paste.

## Installation

```bash
pnpm add @scriba-editor/plugin-embed
```

## Usage

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

// file upload is your own function: it returns the URL (https or relative) given by the server
const mediaOptions: MediaOptions = { upload: (file) => myServerUpload(file), maxSize: 50_000_000 }

const schema = new Schema({
  nodes: { ...basicSchemaSpec.nodes, ...embedNodes, ...mediaNodes },
  marks: basicSchemaSpec.marks,
})

const state = EditorState.create({
  schema,
  plugins: [
    keymap(embedKeymap(t, mediaOptions), { priority: 70 }),
    ...embedPlugins(t, mediaOptions), // double-click on a media item: opens the dialog
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

// Insert menu and slash menu
const item = embedToolbarItem(t, mediaOptions)
const slash = embedSlashItem(t, mediaOptions)
```

## Exports

| Export                                                                                             | Description                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `embedNodes`                                                                                       | `embed` node (block atom): attributes `provider`, `ref`, `title`, `width`, `height`.                               |
| `mediaNodes`                                                                                       | `video_file` and `audio_file` nodes (`<video controls>`, `<audio controls>`), `src` attribute.                     |
| `embedNodeView(t)`, `mediaFileNodeView(t)`                                                         | Node views: a card with type, title and address (the player is not loaded while you write); real player for files. |
| `embedKeymap(t, options?)`                                                                         | `Enter` on a selected media item opens the dialog.                                                                 |
| `embedPlugins(t, options?)`                                                                        | Double-clicking a media item opens the dialog (only if the editor is editable).                                    |
| `embedToolbarItem(t, options?)`                                                                    | "Media" item (`video` icon).                                                                                       |
| `embedSlashItem(t, options?)`                                                                      | Slash item ("/video", "/map", "/spotify"…).                                                                        |
| `openMediaDialog(view, t, options?)`                                                               | The dialog: an address (or the service's `<iframe>` code) or a file to upload.                                     |
| `insertEmbed(attrs)`, `insertMediaFile(kind, src)`, `selectedMedia(state)`                         | Commands and utilities.                                                                                            |
| `embedFromAddress`, `embedFromPlayerUrl`, `playerUrl`, `pageUrl`, `isEmbedRef`, `EMBED_PROVIDERS`… | Reading and building addresses.                                                                                    |
| `EMBED_SANDBOX`, `EMBED_REFERRER_POLICY`, `EMBED_FRAME_SRC`                                        | Security constants (see below).                                                                                    |
| `safeMediaUrl`, `mediaKindOf`, `mediaKindOfType`, `MEDIA_TYPES`                                    | Utilities for video/audio files.                                                                                   |

Options (`MediaOptions`): `upload(file) => Promise<string>` (without it, files can only be
linked by address) and `maxSize` in bytes (default 100 MB, only a help for the user).

## Security

- **Domain whitelist.** Only YouTube (in privacy mode, `youtube-nocookie.com`), Vimeo,
  Dailymotion, Spotify and Google Maps are allowed, and only their exact player addresses, over
  `https`. Any other `<iframe>` (including pasted or loaded ones) is discarded.
- **Fixed `sandbox`.** The iframe is always output with
  `sandbox="allow-scripts allow-same-origin allow-presentation"`,
  `referrerpolicy="strict-origin-when-cross-origin"` and `loading="lazy"`: never read from the input.
- **Validated references** (id, format) with strict regular expressions; title without control
  characters (max 200), width and height within fixed limits.
- **Video/audio files:** only `https` or relative addresses (never `data:`, `blob:`,
  `javascript:`); `controls` always on; autoplay, loop, poster and any other attribute are discarded.
- **CSP.** Pages that display the saved HTML must allow the services in `frame-src`
  (`EMBED_FRAME_SRC`) and, for files, the origin in `media-src`. The editor itself does not load
  the players.
- **Upload:** the type and size check in the browser is only a help; the server must verify the
  real type, size and content.
- Incoming HTML still goes through the schema parser. See [security](../../../docs/security.md)
  and [plugins](../../../docs/plugins.md).

## Accessibility

The card in the editor has `role="img"` with a label (e.g. type and title); the exported iframe
always has a `title` (the title, or the service name). Files have native controls with a label.
The dialog has a focus trap and returns focus to the editor. See
[accessibility](../../../docs/accessibility.md).
