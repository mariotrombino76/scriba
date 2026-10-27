/**
 * WCAG contrast (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio): the
 * relative luminance of two `#rrggbb` colors and their ratio, from 1:1 to 21:1.
 */

const HEX = /^#[0-9a-f]{6}$/

function channels(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new RangeError(`Not a #rrggbb color: ${hex}`)
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

const linear = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Ratio shown to people: rounded down to 2 decimals (4.499 is not 4.5). */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2)
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6
  return [h, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  let rgb: number[]
  if (s === 0) rgb = [l, l, l]
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    rgb = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
  }
  return (
    '#' +
    rgb
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

/**
 * The color closest to `color` (same hue and saturation, only lighter or
 * darker) that reaches `min` contrast with `background`; null if none does.
 */
export function suggestColor(color: string, background: string, min: number): string | null {
  const [h, s, l] = toHsl(color)
  let best: { color: string; delta: number } | null = null
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 100; step++) {
      const next = l + (dir * step) / 100
      if (next < 0 || next > 1) break
      const candidate = fromHsl(h, s, next)
      if (contrastRatio(candidate, background) >= min) {
        if (!best || step < best.delta) best = { color: candidate, delta: step }
        break
      }
    }
  }
  if (best) return best.color
  // even black or white keep the hue too faint: fall back to the better of the two
  for (const plain of ['#000000', '#ffffff'])
    if (contrastRatio(plain, background) >= min) return plain
  return null
}
