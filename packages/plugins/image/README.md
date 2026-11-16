**English** · [Italiano](README.it.md)

# @scriba-editor/plugin-image

Images for the Scriba editor: insert from a file (through **your own upload function**) or from a
URL, drag and drop and paste, resizing, alt text, alignment and **photo editing** (crop, rotate,
flip, brightness, contrast, saturation). Like the TinyMCE image plugin and its image editor.

```bash
pnpm add @scriba-editor/plugin-image
```

## Usage

```ts
import {
  imageContextMenu,
  imageKeymap,
  imageNodes,
  imagePlugins,
  imageToolbarItems,
  imageEditToolbarItems,
  type ImageUploadOptions,
} from '@scriba-editor/plugin-image'

// A real app sends the file to its own server and returns the public URL.
const images: ImageUploadOptions = {
  maxSize: 5 * 1024 * 1024,
  upload: async (file) => {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body })
    if (!res.ok) throw new Error('upload failed')
    const { url } = await res.json()
    return url // or { src: url, alt: 'Description' }
  },
}

// schema: nodes: { ...basicSchemaSpec.nodes, ...imageNodes }
// editor state
plugins: [...imagePlugins(t, images), keymap(imageKeymap(t, images), { priority: 70 })]

// buttons and context menu (right-click on an image)
const items = [...imageToolbarItems(schema, t, images), ...imageEditToolbarItems(t, images)]
const menu = imageContextMenu(schema, t, images)
```

## Options (`ImageUploadOptions`)

| Option    | Description                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload`  | `(file: File) => Promise<string \| { src: string; alt?: string }>`: uploads the file and returns the URL. Without it, dragging and pasting files do nothing and the dialog only accepts a URL. |
| `accept`  | Accepted MIME types (default `image/png`, `image/jpeg`, `image/gif`, `image/webp`). **SVG is rejected** unless you add it.                                                                     |
| `maxSize` | Maximum size in bytes (default 10 MB).                                                                                                                                                         |

## Node and behavior

The `image` node is inline and atomic, with `src`, `alt`, `width` (16–4000 px) and `align` (`left`,
`center`, `right`). Missing `alt` = "needs a description" (the accessibility checker flags it);
`alt=""` = decorative image.

- **Insert**: button, or a dragged or pasted file; the dialog has a file picker with a drop zone
  (only with `upload`), URL, alt text or "decorative", width, alignment.
- **Upload**: the insert position follows the changes made in the meantime; status and errors are
  announced.
- **Resize**: handles on the sides of the selected image (pointer only; from the keyboard you set
  the width in the dialog).
- **Edit**: double-click or Enter on a selected image opens the dialog.
- **Photo editing** (`imageEditToolbarItems`, visible only when an image is selected): rotate,
  flip, crop (free, original, 1:1, 4:3, 16:9), brightness/contrast/saturation from -100 to 100. The
  result is a new file (JPEG and WebP stay as they are, PNG and GIF become PNG) passed to your
  `upload`; **without `upload` it becomes a `data:` URL** within the schema limit. It is a single
  undoable step. An image from another site can be edited only if that site allows CORS.

## Exports

| Name                                                                                        | What it does                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `imageNodes`, `alignStyle`, `MIN_WIDTH`, `MAX_WIDTH`, `ImageAlign`                          | The node and the constants.                 |
| `imagePlugins(t, options)`                                                                  | Drop, file paste, handles, double-click.    |
| `imageKeymap(t, options)`                                                                   | Enter on a selected image opens the dialog. |
| `imageToolbarItems(schema, t, options)`                                                     | "Image" button (inserts or edits).          |
| `imageEditToolbarItems(t, options)`                                                         | "Edit photo" button.                        |
| `imageContextMenu(schema, t, options)`                                                      | Context menu section.                       |
| `openImageDialog`, `openImageEditor`, `selectedImage`                                       | Dialogs from code.                          |
| `uploadImages`, `validateImageFile`, `formatSize`, `DEFAULT_ACCEPT`, `DEFAULT_MAX_SIZE`     | Upload and checks.                          |
| `rotate`, `flip`, `aspectCrop`, `editMatrix`, `outputSize`, `adjustPixels`, `outputType`, … | Photo editing functions.                    |

## Security

- **Upload is your callback**: the editor never uploads anything on its own.
- The MIME type and size check in the browser is **only a help for the user**. Real validation is
  the server's job: real type from the _magic bytes_, size, antivirus if needed. If you enable SVG,
  it must be sanitized on the server and served with the correct `Content-Type` and
  `Content-Disposition`.
- `src` is checked against the URL whitelist wherever the node is created (HTML, JSON,
  collaboration): `http(s)`, relative, or raster `data:` (`png`, `jpeg`, `gif`, `webp`) within the
  size limit; **never `image/svg+xml`**. The URL returned by your `upload` goes through the same
  check and, if rejected, the insert fails with an announced error.
- Width and alignment are typed attributes (alignment with enumerated values), never free `style`.

Saved HTML must always be passed again through `@scriba-editor/sanitize-server`: see
[security](../../../docs/security.md).

## Accessibility

Modal dialogs with focus trap and focus return; messages ("Uploading image…", errors, outcome) in
a polite `status` region; alt text or "decorative" required in the dialog; all of photo editing is
reachable from the keyboard. See [accessibility](../../../docs/accessibility.md) and
[plugins](../../../docs/plugins.md).
