import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const markdown = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { markdown(): string } }).scriba.markdown())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

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
})

test('block shortcuts while typing', async ({ page }) => {
  await page.keyboard.type('## Titolo')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- uno')
  await page.keyboard.press('Enter')
  await page.keyboard.type('due')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter') // leave the list
  await page.keyboard.type('> citazione')
  expect(await html(page)).toBe(
    '<h2>Titolo</h2><ul><li><p>uno</p></li><li><p>due</p></li></ul><blockquote><p>citazione</p></blockquote>',
  )
  expect(await markdown(page)).toBe('## Titolo\n\n- uno\n- due\n\n> citazione\n')
})

test('inline shortcuts while typing; typing goes on without the mark', async ({ page }) => {
  await page.keyboard.type('a **forte** e *corsivo* e `codice` e ~~via~~ fine')
  expect(await html(page)).toBe(
    '<p>a <strong>forte</strong> e <em>corsivo</em> e <code>codice</code> e <s>via</s> fine</p>',
  )
})

test('links: safe URLs only', async ({ page }) => {
  await page.keyboard.type('vai a [Scriba](https://example.com) e [no](javascript:alert(1))')
  expect(await html(page)).toBe(
    '<p>vai a <a href="https://example.com">Scriba</a> e [no](javascript:alert(1))</p>',
  )
})

test('Backspace right after a shortcut gives back the typed text; Ctrl+Z too', async ({ page }) => {
  await page.keyboard.type('# ')
  expect(await html(page)).toBe('<h1></h1>')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p># </p>')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type('**x**')
  expect(await html(page)).toBe('<p><strong>x</strong></p>')
  await page.keyboard.press('Control+z')
  expect(await html(page)).toBe('<p>**x**</p>')
})

test('nothing happens inside code blocks', async ({ page }) => {
  await page.keyboard.type('```js ')
  await page.keyboard.type('# no **no**')
  expect(await html(page)).toBe('<pre><code class="language-js"># no **no**</code></pre>')
})
