import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

test('code block with language, highlighting, newlines and triple Enter to leave', async ({
  page,
}) => {
  await button(page, 'Blocco di codice').click()
  await toolbar(page).getByRole('button', { name: 'Linguaggio' }).click()
  await page.getByRole('menuitemradio', { name: 'JavaScript' }).click()
  await page.keyboard.type('const x = 1')
  await page.keyboard.press('Enter')
  await page.keyboard.type('  return x')
  expect(await html(page)).toBe(
    '<pre><code class="language-javascript">const x = 1\n  return x</code></pre>',
  )
  // highlighting is visual only: spans in the DOM, not in the saved HTML
  const keyword = editor(page).locator('.hljs-keyword').first()
  await expect(keyword).toHaveText('const')
  await expect(keyword).not.toHaveCSS(
    'color',
    await editor(page)
      .locator('pre')
      .evaluate((el) => getComputedStyle(el).color),
  )
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('dopo')
  expect(await html(page)).toBe(
    '<pre><code class="language-javascript">const x = 1\n  return x</code></pre><p>dopo</p>',
  )
})

test('Tab inside a code block does not trap the keyboard', async ({ page }) => {
  await button(page, 'Blocco di codice').click()
  await page.keyboard.type('x')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: "Dopo l'editor" })).toBeFocused()
  expect(await html(page)).toBe('<pre><code>x</code></pre>')
})

test('Ctrl+Enter leaves the code block', async ({ page }) => {
  await page.keyboard.press('Control+Alt+c')
  await page.keyboard.type('a')
  await page.keyboard.press('Control+Enter')
  await page.keyboard.type('b')
  expect(await html(page)).toBe('<pre><code>a</code></pre><p>b</p>')
})
