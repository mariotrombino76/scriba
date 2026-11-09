import { describe, expect, it } from 'vitest'
import {
  NO_EDITS,
  adjustPixels,
  aspectCrop,
  clampCrop,
  editMatrix,
  editedWidth,
  fitRatio,
  flip,
  isUnchanged,
  moveCrop,
  outputSize,
  outputType,
  resizeCrop,
  rotate,
  type ImageEdits,
  type Matrix,
} from '../src/index.js'

const source = { width: 40, height: 20 }
const apply = (m: Matrix, x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]
/** Where the original pixel (centre of) x, y ends up in the edited image. */
const where = (edits: ImageEdits, x: number, y: number) =>
  apply(editMatrix(edits, source), x + 0.5, y + 0.5).map((n) => n - 0.5)

describe('orientation', () => {
  it('rotates clockwise and counterclockwise', () => {
    const cw = rotate(NO_EDITS, source, 1)
    expect(cw.rotation).toBe(90)
    expect(outputSize(cw, source)).toEqual({ width: 20, height: 40 })
    // the top left corner goes to the top right
    expect(where(cw, 0, 0)).toEqual([19, 0])
    const ccw = rotate(NO_EDITS, source, -1)
    expect(ccw.rotation).toBe(270)
    // the top left corner goes to the bottom left
    expect(where(ccw, 0, 0)).toEqual([0, 39])
    expect(rotate(rotate(cw, source, 1), source, 1).rotation).toBe(270)
    expect(rotate(ccw, source, 1)).toEqual(NO_EDITS)
  })

  it('flips the image as it looks now, also after a rotation', () => {
    const h = flip(NO_EDITS, source, 'horizontal')
    expect(where(h, 0, 0)).toEqual([39, 0])
    const v = flip(NO_EDITS, source, 'vertical')
    expect(where(v, 0, 0)).toEqual([0, 19])
    // rotated: the corner is at the top right; a horizontal flip brings it to the top left
    const rh = flip(rotate(NO_EDITS, source, 1), source, 'horizontal')
    expect(outputSize(rh, source)).toEqual({ width: 20, height: 40 })
    expect(where(rh, 0, 0)).toEqual([0, 0])
    expect(where(rh, 39, 0)).toEqual([0, 39])
    const rv = flip(rotate(NO_EDITS, source, 1), source, 'vertical')
    expect(where(rv, 0, 0)).toEqual([19, 39])
    // two flips of the same kind cancel out
    expect(flip(h, source, 'horizontal')).toEqual(NO_EDITS)
    expect(flip(flip(v, source, 'vertical'), source, 'vertical').rotation).toBe(180)
  })

  it('turns the crop with the image', () => {
    const crop = { x: 2, y: 3, width: 10, height: 5 }
    const edits = { ...NO_EDITS, crop }
    // the crop covers the same pixels of the original, whatever the orientation
    const corner = (e: ImageEdits) => where(e, 2, 3)
    for (const next of [
      rotate(edits, source, 1),
      rotate(edits, source, -1),
      flip(edits, source, 'horizontal'),
      flip(edits, source, 'vertical'),
      flip(rotate(edits, source, 1), source, 'horizontal'),
    ]) {
      const size = outputSize(next, source)
      expect(size.width * size.height).toBe(50)
      const [x, y] = corner(next)
      expect([0, size.width - 1]).toContain(x)
      expect([0, size.height - 1]).toContain(y)
    }
    expect(
      rotate(rotate(rotate(rotate(edits, source, 1), source, 1), source, 1), source, 1),
    ).toEqual(edits)
  })
})

describe('crop', () => {
  const bounds = { width: 100, height: 50 }

  it('stays inside the image, with whole pixels and a minimum size', () => {
    expect(clampCrop({ x: -5, y: 10.4, width: 200, height: 2 }, bounds)).toEqual({
      x: 0,
      y: 10,
      width: 100,
      height: 8,
    })
    expect(moveCrop({ x: 10, y: 10, width: 20, height: 20 }, 500, -500, bounds)).toEqual({
      x: 80,
      y: 0,
      width: 20,
      height: 20,
    })
  })

  it('fits a ratio, centred', () => {
    expect(aspectCrop(bounds, 1)).toEqual({ x: 25, y: 0, width: 50, height: 50 })
    expect(aspectCrop(bounds, 4)).toEqual({ x: 0, y: 13, width: 100, height: 25 })
    // around the current crop, pushed back inside
    expect(aspectCrop(bounds, 1, { x: 90, y: 0, width: 10, height: 10 })).toEqual({
      x: 50,
      y: 0,
      width: 50,
      height: 50,
    })
  })

  it('resizes from a handle, the opposite side staying put', () => {
    const rect = { x: 10, y: 10, width: 40, height: 20 }
    expect(resizeCrop(rect, 'se', 10, 5, bounds)).toEqual({ x: 10, y: 10, width: 50, height: 25 })
    expect(resizeCrop(rect, 'nw', -20, -20, bounds)).toEqual({ x: 0, y: 0, width: 50, height: 30 })
    expect(resizeCrop(rect, 'e', 1000, 0, bounds)).toEqual({ x: 10, y: 10, width: 90, height: 20 })
    // never smaller than the minimum
    expect(resizeCrop(rect, 'w', 100, 0, bounds).width).toBe(8)
  })

  it('keeps the ratio while resizing', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 }
    const se = resizeCrop(rect, 'se', 10, 2, bounds, 1)
    expect(se).toEqual({ x: 10, y: 10, width: 30, height: 30 })
    // limited by the image: still square
    const big = resizeCrop(rect, 'se', 500, 500, bounds, 1)
    expect(big.width).toBe(big.height)
    expect(big.y + big.height).toBeLessThanOrEqual(50)
    // a side handle: the other side grows around the centre
    const e = resizeCrop(rect, 'e', 10, 0, bounds, 1)
    expect(e).toEqual({ x: 10, y: 5, width: 30, height: 30 })
  })

  it('applies a ratio to typed sizes', () => {
    expect(fitRatio({ x: 0, y: 0, width: 40, height: 1 }, 2, bounds, 'width')).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    })
    // too high for the image: both shrink
    expect(fitRatio({ x: 0, y: 0, width: 1, height: 80 }, 1, bounds, 'height')).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    })
  })

  it('crops through the matrix', () => {
    const edits = { ...NO_EDITS, crop: { x: 5, y: 4, width: 10, height: 10 } }
    expect(outputSize(edits, source)).toEqual({ width: 10, height: 10 })
    expect(where(edits, 5, 4)).toEqual([0, 0])
    expect(apply(editMatrix(edits, source, 0.5), 5, 4)).toEqual([0, 0])
  })
})

describe('unchanged edits', () => {
  it('knows when nothing would change', () => {
    expect(isUnchanged(NO_EDITS, source)).toBe(true)
    expect(isUnchanged({ ...NO_EDITS, crop: { x: 0, y: 0, ...source } }, source)).toBe(true)
    expect(isUnchanged(rotate(NO_EDITS, source, 1), source)).toBe(false)
    expect(isUnchanged({ ...NO_EDITS, adjust: { ...NO_EDITS.adjust, contrast: 5 } }, source)).toBe(
      false,
    )
  })
})

describe('adjustPixels', () => {
  const pixel = (...rgba: number[]) => new Uint8ClampedArray(rgba)
  const none = { brightness: 0, contrast: 0, saturation: 0 }

  it('leaves pixels alone without adjustments', () => {
    const data = pixel(10, 20, 30, 40)
    adjustPixels(data, none)
    expect([...data]).toEqual([10, 20, 30, 40])
  })

  it('changes brightness and contrast, never alpha', () => {
    const data = pixel(100, 128, 250, 77)
    adjustPixels(data, { ...none, brightness: 10 })
    expect([...data]).toEqual([126, 154, 255, 77])
    const grey = pixel(128, 0, 255, 255)
    adjustPixels(grey, { ...none, contrast: 50 })
    // the middle grey stays, the rest moves away from it
    expect(grey[0]).toBe(128)
    expect(grey[1]).toBe(0)
    expect(grey[2]).toBe(255)
    const flat = pixel(50, 200, 128, 255)
    adjustPixels(flat, { ...none, contrast: -100 })
    expect([...flat.slice(0, 3)]).toEqual([128, 128, 128])
  })

  it('desaturates to grey and saturates', () => {
    const data = pixel(200, 100, 50, 255)
    adjustPixels(data, { ...none, saturation: -100 })
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
    const vivid = pixel(150, 100, 100, 255)
    adjustPixels(vivid, { ...none, saturation: 100 })
    expect(vivid[0]! - vivid[1]!).toBeGreaterThan(50)
  })
})

describe('output', () => {
  it('keeps JPEG and WebP, saves the rest as PNG', () => {
    expect(outputType('data:image/jpeg;base64,AAAA')).toBe('image/jpeg')
    expect(outputType('/foto/mare.JPG?v=2')).toBe('image/jpeg')
    expect(outputType('https://a.example/x.webp#top')).toBe('image/webp')
    expect(outputType('data:image/gif;base64,AAAA')).toBe('image/png')
    expect(outputType('https://a.example/immagine')).toBe('image/png')
  })

  it('keeps the displayed scale', () => {
    const limits = { min: 16, max: 4000 }
    expect(editedWidth(null, 400, 200, limits)).toBeNull()
    expect(editedWidth(200, 400, 100, limits)).toBe(50)
    expect(editedWidth(200, 400, 10, limits)).toBe(16)
  })
})
