import { expect, test, type CDPSession, type Page } from '@playwright/test'

type Scriba = { html(): string; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

/** Composes `text` as an IME would (marked text first), then commits it. */
async function compose(cdp: CDPSession, text: string) {
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  })
  await cdp.send('Input.insertText', { text })
}

test.skip(({ browserName }) => browserName !== 'chromium', 'real IME input needs the Chromium CDP')

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
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

test('Markdown shortcuts work with an IME (composed text)', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await compose(cdp, '#')
  await compose(cdp, ' ')
  await compose(cdp, 'Titolo')
  await expect.poll(() => html(page)).toBe('<h1>Titolo</h1>')
  await page.keyboard.press('Enter')
  await compose(cdp, '**ciao*')
  await compose(cdp, '*')
  await expect.poll(() => html(page)).toBe('<h1>Titolo</h1><p><strong>ciao</strong></p>')
})

test('"/" and "@" composed by an IME open their menus', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await compose(cdp, '/')
  await expect(page.getByRole('listbox', { name: 'Comandi' })).toBeVisible()
  await page.keyboard.press('Escape')
  await compose(cdp, ' ')
  await compose(cdp, '@')
  await expect(page.getByRole('listbox', { name: 'Persone' })).toBeVisible()
})
