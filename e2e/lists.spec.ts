import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const button = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Formattazione' }).getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Editor di prova' }).click()
})

test('bulleted list: shortcut, Enter, Tab, Shift+Tab, Enter on empty item', async ({ page }) => {
  await page.keyboard.press('Control+Shift+8')
  await page.keyboard.type('uno')
  await page.keyboard.press('Enter')
  await page.keyboard.type('due')
  expect(await html(page)).toBe('<ul><li><p>uno</p></li><li><p>due</p></li></ul>')
  await page.keyboard.press('Tab')
  expect(await html(page)).toBe('<ul><li><p>uno</p><ul><li><p>due</p></li></ul></li></ul>')
  await expect(button(page, 'Elenco puntato')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Shift+Tab')
  expect(await html(page)).toBe('<ul><li><p>uno</p></li><li><p>due</p></li></ul>')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fine')
  expect(await html(page)).toBe('<ul><li><p>uno</p></li><li><p>due</p></li></ul><p>fine</p>')
})

test('numbered list from the toolbar and Backspace at item start', async ({ page }) => {
  await page.keyboard.type('a')
  await button(page, 'Elenco numerato').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('b')
  expect(await html(page)).toBe('<ol><li><p>a</p></li><li><p>b</p></li></ol>')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<ol><li><p>a</p></li></ol><p>b</p>')
  await page.keyboard.press('Control+z')
  expect(await html(page)).toBe('<ol><li><p>a</p></li><li><p>b</p></li></ol>')
})

test('Tab outside a list leaves the editor (no keyboard trap)', async ({ page }) => {
  await page.keyboard.type('x')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: "Dopo l'editor" })).toBeFocused()
  expect(await html(page)).toBe('<p>x</p>')
})

test('blockquote: toggle from the toolbar, Backspace at start lifts out', async ({ page }) => {
  await page.keyboard.type('citazione')
  await button(page, 'Citazione').click()
  expect(await html(page)).toBe('<blockquote><p>citazione</p></blockquote>')
  await expect(button(page, 'Citazione')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p>citazione</p>')
})

test('blockquote: Enter twice at the end leaves the quote', async ({ page }) => {
  await page.keyboard.type('citazione')
  await button(page, 'Citazione').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fuori')
  expect(await html(page)).toBe('<blockquote><p>citazione</p></blockquote><p>fuori</p>')
  await expect(button(page, 'Citazione')).toHaveAttribute('aria-pressed', 'false')
})
