/**
 * Image editing geometry, pure: no DOM, no canvas. The edits are kept as an
 * orientation (optional horizontal mirror of the original, then a clockwise
 * rotation) plus a crop rectangle in the pixels of the oriented image and
 * colour adjustments. Every operation returns new edits.
 */

export type Rotation = 0 | 90 | 180 | 270

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Rect extends Size {
  readonly x: number
  readonly y: number
}

/** Colour adjustments, each from -100 to 100 (0 = unchanged). */
export interface Adjustments {
  readonly brightness: number
  readonly contrast: number
  readonly saturation: number
}

export interface ImageEdits {
  /** Clockwise rotation, applied after the mirror. */
  readonly rotation: Rotation
  /** Horizontal mirror of the original image. */
  readonly mirror: boolean
  /** Crop in the pixels of the oriented image; null = the whole image. */
  readonly crop: Rect | null
  readonly adjust: Adjustments
}

export const NO_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0 }
export const NO_EDITS: ImageEdits = {
  rotation: 0,
  mirror: false,
  crop: null,
  adjust: NO_ADJUSTMENTS,
}
/** Smallest crop side, in pixels. */
export const MIN_CROP = 8

/** Corner and side handles of the crop rectangle. */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const turn = (r: number): Rotation => (((r % 360) + 360) % 360) as Rotation

/** Size of the original once rotated. */
export function orientedSize(source: Size, rotation: Rotation): Size {
  return rotation % 180 === 0 ? source : { width: source.height, height: source.width }
}

/** The crop actually used: the whole oriented image when none is set. */
export function cropRect(edits: ImageEdits, source: Size): Rect {
  const size = orientedSize(source, edits.rotation)
  return edits.crop ?? { x: 0, y: 0, ...size }
}

/** Size of the edited image. */
export function outputSize(edits: ImageEdits, source: Size): Size {
  const { width, height } = cropRect(edits, source)
  return { width, height }
}

/** Rotates by 90° (`1` clockwise, `-1` counterclockwise); the crop turns with the image. */
export function rotate(edits: ImageEdits, source: Size, direction: 1 | -1): ImageEdits {
  const { width: w, height: h } = orientedSize(source, edits.rotation)
  const c = edits.crop
  const crop =
    c &&
    (direction === 1
      ? { x: h - c.y - c.height, y: c.x, width: c.height, height: c.width }
      : { x: c.y, y: w - c.x - c.width, width: c.height, height: c.width })
  return { ...edits, rotation: turn(edits.rotation + 90 * direction), crop }
}

/**
 * Mirrors the image as it looks now (`horizontal`: left ↔ right). Mirroring
 * after a rotation r equals mirroring the original, then rotating by -r
 * (horizontal) or 180 - r (vertical).
 */
export function flip(edits: ImageEdits, source: Size, axis: 'horizontal' | 'vertical'): ImageEdits {
  const { width: w, height: h } = orientedSize(source, edits.rotation)
  const c = edits.crop
  const crop =
    c && (axis === 'horizontal' ? { ...c, x: w - c.x - c.width } : { ...c, y: h - c.y - c.height })
  const rotation = turn(axis === 'horizontal' ? -edits.rotation : 180 - edits.rotation)
  return { ...edits, mirror: !edits.mirror, rotation, crop }
}

/** Integer rectangle inside `bounds`, at least MIN_CROP (or the bounds) wide and high. */
export function clampCrop(rect: Rect, bounds: Size): Rect {
  const minW = Math.min(MIN_CROP, bounds.width)
  const minH = Math.min(MIN_CROP, bounds.height)
  const width = Math.round(Math.min(Math.max(rect.width, minW), bounds.width))
  const height = Math.round(Math.min(Math.max(rect.height, minH), bounds.height))
  const x = Math.round(Math.min(Math.max(rect.x, 0), bounds.width - width))
  const y = Math.round(Math.min(Math.max(rect.y, 0), bounds.height - height))
  return { x, y, width, height }
}

/**
 * The largest rectangle with this aspect ratio (width / height) centred on
 * `around` (default: the centre of the image) that fits the bounds.
 */
export function aspectCrop(bounds: Size, ratio: number, around?: Rect): Rect {
  let width = bounds.width
  let height = width / ratio
  if (height > bounds.height) {
    height = bounds.height
    width = height * ratio
  }
  const cx = around ? around.x + around.width / 2 : bounds.width / 2
  const cy = around ? around.y + around.height / 2 : bounds.height / 2
  return clampCrop({ x: cx - width / 2, y: cy - height / 2, width, height }, bounds)
}

/**
 * Moves one handle by (dx, dy) image pixels; the opposite side stays put.
 * With a ratio, the rectangle keeps it (corners follow the larger movement).
 */
export function resizeCrop(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Size,
  ratio: number | null = null,
): Rect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height
  const min = (n: number) => Math.min(MIN_CROP, n)
  if (handle.includes('w')) left = Math.min(Math.max(left + dx, 0), right - min(bounds.width))
  if (handle.includes('e'))
    right = Math.max(Math.min(right + dx, bounds.width), left + min(bounds.width))
  if (handle.includes('n')) top = Math.min(Math.max(top + dy, 0), bottom - min(bounds.height))
  if (handle.includes('s'))
    bottom = Math.max(Math.min(bottom + dy, bounds.height), top + min(bounds.height))
  if (ratio) return keepRatio({ left, top, right, bottom }, rect, handle, bounds, ratio)
  return clampCrop({ x: left, y: top, width: right - left, height: bottom - top }, bounds)
}

function keepRatio(
  box: { left: number; top: number; right: number; bottom: number },
  before: Rect,
  handle: Handle,
  bounds: Size,
  ratio: number,
): Rect {
  let width = box.right - box.left
  let height = box.bottom - box.top
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  // a side handle drives its own dimension; a corner follows the larger change
  const byWidth =
    horizontal &&
    (!vertical ||
      Math.abs(width - before.width) / before.width >=
        Math.abs(height - before.height) / before.height)
  if (byWidth) height = width / ratio
  else width = height * ratio
  // the fixed anchor: the opposite side (or the centre, for a side handle's other axis)
  const ax = handle.includes('w')
    ? box.right
    : handle.includes('e')
      ? box.left
      : before.x + before.width / 2
  const ay = handle.includes('n')
    ? box.bottom
    : handle.includes('s')
      ? box.top
      : before.y + before.height / 2
  // the room available from the anchor, in the direction the rectangle grows
  const roomW = handle.includes('w')
    ? ax
    : handle.includes('e')
      ? bounds.width - ax
      : 2 * Math.min(ax, bounds.width - ax)
  const roomH = handle.includes('n')
    ? ay
    : handle.includes('s')
      ? bounds.height - ay
      : 2 * Math.min(ay, bounds.height - ay)
  const scale = Math.min(1, roomW / width, roomH / height)
  width *= scale
  height *= scale
  const x = handle.includes('w') ? ax - width : handle.includes('e') ? ax : ax - width / 2
  const y = handle.includes('n') ? ay - height : handle.includes('s') ? ay : ay - height / 2
  return clampCrop({ x, y, width, height }, bounds)
}

/**
 * Gives the rectangle the ratio, from the side the user typed (`by`): the
 * other side follows; both shrink together if the result would not fit.
 */
export function fitRatio(rect: Rect, ratio: number, bounds: Size, by: 'width' | 'height'): Rect {
  let width = by === 'width' ? rect.width : rect.height * ratio
  let height = by === 'width' ? rect.width / ratio : rect.height
  const scale = Math.min(1, bounds.width / width, bounds.height / height)
  width *= scale
  height *= scale
  return clampCrop({ x: rect.x, y: rect.y, width, height }, bounds)
}

/** Moves the crop by (dx, dy), staying inside the bounds. */
export function moveCrop(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds)
}

export function isUnchanged(edits: ImageEdits, source: Size): boolean {
  const crop = edits.crop
  const size = orientedSize(source, edits.rotation)
  const fullCrop =
    !crop ||
    (crop.x === 0 && crop.y === 0 && crop.width === size.width && crop.height === size.height)
  const a = edits.adjust
  return (
    edits.rotation === 0 &&
    !edits.mirror &&
    fullCrop &&
    a.brightness === 0 &&
    a.contrast === 0 &&
    a.saturation === 0
  )
}

/** A 2D affine matrix [a, b, c, d, e, f], as in `CanvasRenderingContext2D.setTransform`. */
export type Matrix = readonly [number, number, number, number, number, number]

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
// exact values: no floating point drift on right angles
const COS_SIN: Record<Rotation, readonly [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
}

/**
 * Maps a pixel of the original image to the edited canvas, scaled by
 * `scale`: mirror, rotate around the centre, then shift by the crop.
 */
export function editMatrix(edits: ImageEdits, source: Size, scale = 1): Matrix {
  const oriented = orientedSize(source, edits.rotation)
  const crop = cropRect(edits, source)
  const [cos, sin] = COS_SIN[edits.rotation]
  let m: Matrix = [scale, 0, 0, scale, 0, 0]
  m = multiply(m, [1, 0, 0, 1, oriented.width / 2 - crop.x, oriented.height / 2 - crop.y])
  m = multiply(m, [cos, sin, -sin, cos, 0, 0])
  if (edits.mirror) m = multiply(m, [-1, 0, 0, 1, 0, 0])
  return multiply(m, [1, 0, 0, 1, -source.width / 2, -source.height / 2])
}

/** The displayed width after editing, keeping the scale the image had in the document. */
export function editedWidth(
  width: number | null,
  sourceWidth: number,
  newWidth: number,
  limits: { min: number; max: number },
): number | null {
  if (width === null || !sourceWidth) return null
  const w = Math.round((width / sourceWidth) * newWidth)
  return Math.min(Math.max(w, limits.min), limits.max)
}
