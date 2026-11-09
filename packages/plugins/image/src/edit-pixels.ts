import type { Adjustments } from './edit-geometry.js'

// Rec. 709 luma weights
const R = 0.2126
const G = 0.7152
const B = 0.0722

/**
 * Applies brightness, contrast and saturation (each -100…100) in place to
 * RGBA pixels (as from `getImageData`). Alpha is left alone. Done by hand
 * rather than with `ctx.filter`, which not every browser supports.
 */
export function adjustPixels(data: Uint8ClampedArray, adjust: Adjustments): void {
  const { brightness, contrast, saturation } = adjust
  if (!brightness && !contrast && !saturation) return
  const offset = brightness * 2.55
  const c = contrast * 2.55
  // standard contrast curve around the middle grey; 259 keeps the factor finite at +100
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  const sat = 1 + saturation / 100
  // a lookup table for brightness + contrast: the same for every channel
  const curve = new Float32Array(256)
  for (let v = 0; v < 256; v++) curve[v] = factor * (v + offset - 128) + 128
  for (let i = 0; i < data.length; i += 4) {
    let r = curve[data[i]!]!
    let g = curve[data[i + 1]!]!
    let b = curve[data[i + 2]!]!
    if (saturation) {
      const grey = R * r + G * g + B * b
      r = grey + (r - grey) * sat
      g = grey + (g - grey) * sat
      b = grey + (b - grey) * sat
    }
    // Uint8ClampedArray rounds and clamps to 0…255
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}
