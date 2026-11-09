import {
  NodeSelection,
  Plugin,
  type Command,
  type EditorState,
  type KeyBindings,
  type Schema,
} from '@scriba/core'
import type { Translate } from '@scriba/i18n'
import { withoutPressed, type ContextMenuSection, type ToolbarControl } from '@scriba/ui'
import type { EditorView, ViewPluginProps } from '@scriba/view'
import { openImageDialog } from './dialog.js'
import { openImageEditor } from './edit-dialog.js'
import { resizeView } from './resize.js'
import { uploadImages, uploadTracker, type ImageUploadOptions } from './upload.js'

export { imageNodes, alignStyle, MIN_WIDTH, MAX_WIDTH, type ImageAlign } from './nodes.js'
export {
  uploadImages,
  validateImageFile,
  formatSize,
  DEFAULT_ACCEPT,
  DEFAULT_MAX_SIZE,
  type ImageUploadOptions,
  type UploadResult,
} from './upload.js'
export { openImageDialog, selectedImage } from './dialog.js'
export { openImageEditor } from './edit-dialog.js'
export {
  NO_EDITS,
  rotate,
  flip,
  aspectCrop,
  resizeCrop,
  moveCrop,
  clampCrop,
  fitRatio,
  editMatrix,
  outputSize,
  orientedSize,
  isUnchanged,
  editedWidth,
  type ImageEdits,
  type Adjustments,
  type Rect,
  type Rotation,
  type Matrix,
} from './edit-geometry.js'
export { adjustPixels } from './edit-pixels.js'
export { outputType } from './edit-render.js'

/**
 * Image support for the view: drop and paste of image files (through your
 * `upload` callback), resize handles on the selected image, double-click to
 * edit. Use together with `imageNodes` in the schema.
 */
export function imagePlugins(t: Translate, options: ImageUploadOptions = {}): Plugin[] {
  const props: ViewPluginProps = {
    pluginView: resizeView,
    handleDrop(view, event, pos) {
      const files = [...(event.dataTransfer?.files ?? [])]
      if (!files.length) return false
      return uploadImages(view, files, pos ?? view.state.selection.from, options, t)
    },
    handlePasteFiles(view, files) {
      return uploadImages(view, files, view.state.selection.from, options, t)
    },
    handleDoubleClickNode(view, _pos, node) {
      if (node.type.name !== 'image') return false
      openImageDialog(view, t, options)
      return true
    },
  }
  return [uploadTracker(), new Plugin({ props: { ...props } })]
}

/** Enter on a selected image opens its dialog. */
export function imageKeymap(t: Translate, options: ImageUploadOptions = {}): KeyBindings {
  const edit: Command = (state, _dispatch, view) => {
    const sel = state.selection
    if (!view || !(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return false
    openImageDialog(view as EditorView, t, options)
    return true
  }
  return { Enter: edit }
}

/** Toolbar button: insert an image, or edit the selected one. */
export function imageToolbarItems(
  schema: Schema,
  t: Translate,
  options: ImageUploadOptions = {},
): ToolbarControl[] {
  const type = schema.nodes['image']
  if (!type) throw new RangeError('The schema has no "image" node (add imageNodes)')
  return [
    {
      type: 'button',
      id: 'image',
      icon: 'image',
      label: (tr) => tr('image.label'),
      command: (state) =>
        state.selection.$from.parent.type.canContain(type) ||
        state.selection instanceof NodeSelection,
      isActive: (state) =>
        state.selection instanceof NodeSelection && state.selection.node.type === type,
      run: (view) => openImageDialog(view, t, options),
    },
  ]
}

const isImageSelected = (state: EditorState) =>
  state.selection instanceof NodeSelection && state.selection.node.type.name === 'image'

/**
 * Toolbar button: edit the selected image as a photo (rotate, mirror, crop,
 * brightness, contrast, saturation). Enabled only on a selected image.
 */
export function imageEditToolbarItems(
  t: Translate,
  options: ImageUploadOptions = {},
): ToolbarControl[] {
  return [
    {
      type: 'button',
      id: 'imageEdit',
      icon: 'crop',
      label: (tr) => tr('imageEdit.label'),
      command: isImageSelected,
      // contextual: shown only while an image is selected
      isVisible: isImageSelected,
      run: (view) => void openImageEditor(view, t, options),
    },
  ]
}

/** Context menu section on an image (a right click selects it): its properties, or the photo editor. */
export function imageContextMenu(
  schema: Schema,
  t: Translate,
  options: ImageUploadOptions = {},
): ContextMenuSection {
  return {
    id: 'image',
    isVisible: (state) =>
      state.selection instanceof NodeSelection && state.selection.node.type.name === 'image',
    // an action here, not a pressed toggle
    items: [
      ...imageToolbarItems(schema, t, options).map(withoutPressed),
      ...imageEditToolbarItems(t, options),
    ],
  }
}
