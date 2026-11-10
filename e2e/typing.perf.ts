import { expect, test } from '@playwright/test'

/**
 * CLAUDE.md §7 (`pnpm test:perf`): a 1 MB document stays fluid, typing under 16 ms per key. Measured in the
 * page (no test-runner overhead): the model update, the view, the plugins and the layout
 * the browser does before painting. The median is the budget (best of three rounds: other
 * work on the machine is not the editor's).
 */
test('1 MB document: a keystroke takes under 16 ms (median)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const editor = page.getByRole('textbox', { name: 'Editor di prova' })
  await editor.click()
  const chars = await page.evaluate(() => {
    const s =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi. '
    const parts: string[] = []
    for (let i = 0; i < 5700; i++)
      parts.push(
        i % 10
          ? `<p>${s.slice(0, 60)}<strong>${s.slice(60, 90)}</strong>${s.slice(90)}</p>`
          : `<h2>Sezione ${i}</h2>`,
      )
    const w = window as unknown as {
      scriba: { setHTML(h: string): void; view: import('@scriba-editor/view').EditorView }
    }
    w.scriba.setHTML(parts.join(''))
    const v = w.scriba.view
    const Sel = v.state.selection.constructor as typeof import('@scriba-editor/core').Selection
    v.dispatch(v.state.tr.setSelection(Sel.near(v.state.doc.resolve(v.state.doc.content.size / 2))))
    v.focus()
    return v.state.doc.textContent.length
  })
  expect(chars).toBeGreaterThan(1_000_000)
  // three rounds of 40 keys: the best median, so that a burst of other work on the
  // machine does not count as the editor's
  const rounds = await editor.evaluate(async (el) => {
    const medians: number[][] = []
    for (let round = 0; round < 3; round++) {
      const out: number[] = []
      for (let i = 0; i < 40; i++) {
        const t0 = performance.now()
        el.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: 'a',
            bubbles: true,
            cancelable: true,
          }),
        )
        void (el as HTMLElement).offsetHeight // the layout the browser does before painting
        out.push(performance.now() - t0)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      medians.push(out.sort((a, b) => a - b))
    }
    return medians
  })
  const best = rounds.sort((a, b) => a[20]! - b[20]!)[0]!
  const median = best[20]!
  test.info().annotations.push({
    type: 'per-key',
    description: `median ${median.toFixed(1)} ms, p90 ${best[36]!.toFixed(1)} ms`,
  })
  expect(median).toBeLessThan(16)
})
