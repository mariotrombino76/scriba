import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

/** Screen box of a word of the editor's text. */
async function wordBox(page: Page, word: string) {
  return editor(page).evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(w)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(n, at)
      range.setEnd(n, at + w.length)
      const r = range.getBoundingClientRect()
      return { left: r.left, right: r.right, y: r.top + r.height / 2 }
    }
    throw new Error(`No "${w}" in the editor`)
  }, word)
}

async function clickWord(page: Page, word: string) {
  const box = await wordBox(page, word)
  await page.mouse.click((box.left + box.right) / 2, box.y)
}

async function formatMenu(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Formato' })
    .click()
  await page
    .getByRole('menu', { name: 'Formato' })
    .getByRole('menuitemcheckbox', { name: 'Copia formato' })
    .click()
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
  await setHTML(page, '<p><strong><em>uno</em></strong> due tre</p>')
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('Formato ▸ Copia formato, then a click on a word gives it the format, once', async ({
  page,
}) => {
  await clickWord(page, 'uno')
  await formatMenu(page)
  await expect(editor(page)).toHaveClass(/scriba-format-painting/)
  await expect(page.getByRole('status').filter({ hasText: 'Formato copiato' })).toBeAttached()
  await clickWord(page, 'tre')
  await expect
    .poll(() => html(page))
    .toBe('<p><strong><em>uno</em></strong> due <strong><em>tre</em></strong></p>')
  await expect(editor(page)).not.toHaveClass(/scriba-format-painting/)
  // only once: the next click changes nothing
  await clickWord(page, 'due')
  expect(await html(page)).toBe(
    '<p><strong><em>uno</em></strong> due <strong><em>tre</em></strong></p>',
  )
  // one undo step
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p><strong><em>uno</em></strong> due tre</p>')
})

test('a mouse selection receives the format', async ({ page }) => {
  await clickWord(page, 'uno')
  await formatMenu(page)
  const due = await wordBox(page, 'due')
  const tre = await wordBox(page, 'tre')
  await page.mouse.move(due.left + 1, due.y)
  await page.mouse.down()
  await page.mouse.move(tre.right - 1, tre.y, { steps: 5 })
  await page.mouse.move(tre.right, tre.y)
  await page.mouse.up()
  await expect
    .poll(() => html(page))
    .toBe('<p><strong><em>uno</em></strong> <strong><em>due tre</em></strong></p>')
})

test('Ctrl+Alt+C copies, Ctrl+Alt+V applies to the keyboard selection', async ({ page }) => {
  await clickWord(page, 'uno')
  await page.keyboard.press('Control+Alt+c')
  await expect(editor(page)).not.toHaveClass(/scriba-format-painting/)
  await page.keyboard.press('End')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Control+Alt+v')
  await expect
    .poll(() => html(page))
    .toBe('<p><strong><em>uno</em></strong> due <strong><em>tre</em></strong></p>')
})

test('Esc stops waiting: nothing changes', async ({ page }) => {
  await clickWord(page, 'uno')
  await formatMenu(page)
  await expect(editor(page)).toHaveClass(/scriba-format-painting/)
  await editor(page).focus()
  await page.keyboard.press('Escape')
  await expect(editor(page)).not.toHaveClass(/scriba-format-painting/)
  await clickWord(page, 'tre')
  expect(await html(page)).toBe('<p><strong><em>uno</em></strong> due tre</p>')
})

test('a whole paragraph selected gets the heading and its alignment', async ({ page }) => {
  // centered with the keyboard: HTML with a style attribute would make Chromium report the
  // (blocked, harmless) styles of the inert DOMParser document, see source.spec.ts
  await setHTML(page, '<h2>Titolo</h2><p>testo semplice</p>')
  await clickWord(page, 'Titolo')
  await page.keyboard.press('Control+Shift+e')
  await formatMenu(page)
  // the whole paragraph, selected with the mouse (a single click would format one word)
  const first = await wordBox(page, 'testo')
  const last = await wordBox(page, 'semplice')
  await page.mouse.move(first.left + 1, first.y)
  await page.mouse.down()
  await page.mouse.move(last.right - 1, last.y, { steps: 5 })
  await page.mouse.move(last.right + 20, last.y)
  await page.mouse.up()
  await expect
    .poll(() => html(page))
    .toBe(
      '<h2 style="text-align: center">Titolo</h2><h2 style="text-align: center">testo semplice</h2>',
    )
})
