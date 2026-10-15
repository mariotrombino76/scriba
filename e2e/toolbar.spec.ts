import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Editor di prova' }).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
})

test('toolbar buttons format the selection and show their state', async ({ page }) => {
  await page.keyboard.type('ciao')
  await page.keyboard.press('Shift+Home')
  await button(page, 'Grassetto').click()
  expect(await html(page)).toBe('<p><strong>ciao</strong></p>')
  await expect(button(page, 'Grassetto')).toHaveAttribute('aria-pressed', 'true')
  await button(page, 'Titolo 2').click()
  expect(await html(page)).toBe('<h2><strong>ciao</strong></h2>')
  await expect(button(page, 'Titolo 2')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Paragrafo')).toHaveAttribute('aria-pressed', 'false')
  // the editor keeps the selection: typing replaces it
  await page.keyboard.type('X')
  expect(await html(page)).toBe('<h2><strong>X</strong></h2>')
  await button(page, 'Annulla').click()
  expect(await html(page)).toBe('<h2><strong>ciao</strong></h2>')
})

test('toolbar is keyboard accessible (one tab stop, arrows, Escape)', async ({ page }) => {
  await page.keyboard.type('ab')
  await page.keyboard.press('Shift+ArrowLeft')
  // Shift+Tab from the editor reaches the toolbar's single tab stop
  await page.keyboard.press('Shift+Tab')
  await expect(button(page, 'Grassetto')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(button(page, 'Corsivo')).toBeFocused()
  await page.keyboard.press('End')
  await expect(button(page, 'Dimensione carattere')).toBeFocused() // last control
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe('<p>a<em>b</em></p>')
  await expect(button(page, 'Corsivo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: 'Editor di prova' })).toBeFocused()
  await page.keyboard.type('c')
  expect(await html(page)).toBe('<p>a<em>c</em></p>')
})

test('tooltips show the shortcut', async ({ page }) => {
  await expect(button(page, 'Grassetto')).toHaveAttribute('title', 'Grassetto (Ctrl+B)')
  await expect(button(page, 'Titolo 1')).toHaveAttribute('title', 'Titolo 1 (Ctrl+Alt+1)')
})

test('every toolbar control has a unique accessible name', async ({ page }) => {
  const names = await toolbar(page)
    .locator(':scope > button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(names.length).toBeGreaterThan(10)
  expect(new Set(names).size).toBe(names.length)
})
