import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

async function viewMenu(page: Page, name: string) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Visualizza' })
    .click()
  const entry = page
    .getByRole('menu', { name: 'Visualizza' })
    .getByRole('menuitemcheckbox', { name })
  await entry.click()
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('Visualizza ▸ Mostra blocchi outlines the blocks; the HTML stays the same', async ({
  page,
}) => {
  const source = '<h2>Titolo</h2><p>testo</p>'
  await setHTML(page, source)
  await viewMenu(page, 'Mostra blocchi')
  await expect(editor(page)).toHaveClass(/scriba-show-blocks/)
  const outline = await editor(page)
    .getByText('testo')
    .evaluate((p) => getComputedStyle(p).outlineStyle)
  expect(outline).toBe('dashed')
  expect(
    await editor(page)
      .getByRole('heading', { name: 'Titolo' })
      .evaluate((h) => getComputedStyle(h, '::before').content),
  ).toBe('"H2"')
  // typing still works, and the label is not text
  await editor(page).getByText('testo').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect.poll(() => html(page)).toBe('<h2>Titolo</h2><p>testo!</p>')
  await viewMenu(page, 'Mostra blocchi')
  await expect(editor(page)).not.toHaveClass(/scriba-show-blocks/)
})

test('Visualizza ▸ Mostra caratteri invisibili highlights non-breaking spaces', async ({
  page,
}) => {
  await setHTML(page, '<p>10&nbsp;km</p>')
  await expect(editor(page).locator('.scriba-char-nbsp')).toHaveCount(0)
  await viewMenu(page, 'Mostra caratteri invisibili')
  await expect(editor(page).locator('.scriba-char-nbsp')).toHaveCount(1)
  await editor(page).getByText('km').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+Shift+Space')
  await page.keyboard.type('a')
  await expect(editor(page).locator('.scriba-char-nbsp')).toHaveCount(2)
  await expect.poll(() => html(page)).toBe('<p>10\u00a0km\u00a0a</p>')
})
