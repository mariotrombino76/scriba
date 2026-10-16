import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** WCAG 2.2 contrast checks on the theme variables (CLAUDE.md §6). */
const css = readFileSync(new URL('../scriba.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--scriba-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  )
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = { light: block(':root {'), dark: block(":root[data-scriba-theme='dark']") }

describe.each(Object.entries(themes))('%s theme contrast', (_name, v) => {
  it.each([
    ['text', 'bg', 4.5],
    ['muted', 'bg', 4.5],
    ['accent', 'accent-bg', 4.5],
    ['text', 'accent-bg', 4.5],
    ['text', 'code-bg', 4.5],
    ['error', 'bg', 4.5],
    ['bg', 'accent', 4.5],
    ...(
      ['keyword', 'string', 'number', 'comment', 'title', 'attr', 'builtin', 'meta'] as const
    ).map((t) => [`hl-${t}`, 'code-bg', 4.5] as const),
    ['text', 'find-bg', 4.5],
    ['text', 'comment-bg', 4.5],
    ['suggest-insert', 'bg', 4.5],
    ['suggest-delete', 'bg', 4.5],
    ['text', 'comment-active', 4.5],
    ['text', 'find-current', 4.5],
    ['focus', 'find-current', 3],
    ['focus', 'bg', 3],
    ['accent', 'bg', 3],
    ...(['info', 'tip', 'warning', 'danger'] as const).flatMap((k) => [
      ['text', `callout-${k}-bg`, 4.5] as const,
      ['muted', `callout-${k}-bg`, 4.5] as const,
      [`callout-${k}`, `callout-${k}-bg`, 3] as const,
    ]),
  ] as const)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(v[fg], `missing --scriba-${fg}`).toBeDefined()
    expect(ratio(v[fg]!, v[bg]!)).toBeGreaterThanOrEqual(min)
  })
})

it('dark values are the same in the media query and the explicit attribute', () => {
  expect(block('@media (prefers-color-scheme: dark)')).toEqual(themes.dark)
})

it('collaboration name labels: white text on every user color ≥ 4.5:1', () => {
  const colors = [...css.matchAll(/--scriba-collab:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]!)
  expect(colors.length).toBeGreaterThanOrEqual(8)
  for (const c of colors) expect(ratio(c, '#ffffff'), c).toBeGreaterThanOrEqual(4.5)
})
