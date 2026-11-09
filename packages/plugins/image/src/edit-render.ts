import { editMatrix, outputSize, type ImageEdits, type Size } from './edit-geometry.js'
import { adjustPixels } from './edit-pixels.js'

/** Largest canvas area every browser can draw (Safari's limit). */
export const MAX_CANVAS_AREA = 16_777_216

export type LoadError = 'load' | 'foreign'

/**
 * Loads the image for editing. Images from another site are requested with
 * CORS: without permission from that site the canvas could not be read, and
 * the error is 'foreign'. Nothing is attached to the page.
 */
export function loadEditableImage(doc: Document, src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = doc.createElement('img')
    if (!/^(data|blob):/i.test(src)) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.addEventListener('load', () => {
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error('load' satisfies LoadError))
      else if (!readable(doc, img)) reject(new Error('foreign' satisfies LoadError))
      else resolve(img)
    })
    // a refused CORS request also ends here: the image may well exist
    img.addEventListener('error', () =>
      reject(new Error((/^https?:/i.test(src) ? 'foreign' : 'load') satisfies LoadError)),
    )
    img.src = src
  })
}

function readable(doc: Document, img: HTMLImageElement): boolean {
  const canvas = doc.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  try {
    ctx.drawImage(img, 0, 0, 1, 1)
    ctx.getImageData(0, 0, 1, 1)
    return true
  } catch {
    return false
  }
}

/** The scale (≤ 1) that keeps the result within `maxSide` and the canvas area limit. */
export function fitScale(size: Size, maxSide = Infinity): number {
  const bySide = Math.min(1, maxSide / Math.max(size.width, size.height))
  const byArea = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (size.width * size.height)))
  return Math.min(bySide, byArea)
}

/** Draws the edited image on a new canvas, scaled by `scale`. */
export function renderEdits(
  doc: Document,
  img: CanvasImageSource,
  source: Size,
  edits: ImageEdits,
  scale = 1,
): HTMLCanvasElement {
  const size = outputSize(edits, source)
  const canvas = doc.createElement('canvas')
  canvas.width = Math.max(1, Math.round(size.width * scale))
  canvas.height = Math.max(1, Math.round(size.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(...editMatrix(edits, source, scale))
  ctx.drawImage(img, 0, 0, source.width, source.height)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const a = edits.adjust
  if (a.brightness || a.contrast || a.saturation) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    adjustPixels(pixels.data, a)
    ctx.putImageData(pixels, 0, 0)
  }
  return canvas
}

/**
 * The type to save as: JPEG and WebP stay themselves; PNG, GIF (only the
 * first frame survives a canvas) and anything unknown become PNG.
 */
export function outputType(src: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const data = /^data:image\/([a-z]+)[;,]/i.exec(src)
  const ext = data ? data[1]! : /\.([a-z0-9]+)$/i.exec(src.split(/[?#]/)[0]!)?.[1]
  switch (ext?.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Encodes the canvas. A browser that cannot write WebP gives PNG: the file says which. */
export function canvasToFile(canvas: HTMLCanvasElement, type: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('encode'))
        const ext = EXTENSIONS[blob.type] ?? 'png'
        resolve(new File([blob], `image-edited.${ext}`, { type: blob.type || 'image/png' }))
      },
      type,
      0.92,
    )
  })
}

/** A file as a `data:` URL (used when no upload callback is configured). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
