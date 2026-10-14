import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })
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
  // typed styles are applied through CSSOM: no CSP violations
  expect(
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

test('alignment from the toolbar and indentation', async ({ page }) => {
  await page.keyboard.type('titolo')
  await button(page, 'Centra').click()
  expect(await html(page)).toBe('<p style="text-align: center">titolo</p>')
  await expect(button(page, 'Centra')).toHaveAttribute('aria-pressed', 'true')
  await expect(editor(page).locator('p')).toHaveCSS('text-align', 'center')
  await button(page, 'Aumenta rientro').click()
  expect(await html(page)).toBe('<p style="text-align: center; margin-left: 2em">titolo</p>')
})

test('text color through the menu, keyboard only', async ({ page }) => {
  await page.keyboard.type('rosso')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Shift+Tab') // into the toolbar
  await page.keyboard.press('End')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft') // Dimensione → Carattere → Evidenziazione → Colore testo
  await expect(button(page, 'Colore testo')).toBeFocused()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu', { name: 'Colore testo' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'Rosso' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  expect(await html(page)).toBe('<p><span style="color: #b91c1c">rosso</span></p>')
  await expect(editor(page).locator('span')).toHaveCSS('color', 'rgb(185, 28, 28)')
})

test('Escape closes a menu and returns focus to its button', async ({ page }) => {
  await button(page, 'Carattere').click()
  await expect(page.getByRole('menu', { name: 'Carattere' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Carattere' })).toBeHidden()
  await expect(button(page, 'Carattere')).toBeFocused()
})

test('link dialog: Ctrl+K, focus trap, invalid URL, save, edit, remove', async ({ page }) => {
  await page.keyboard.type('sito')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Inserisci link' })
  await expect(dialog).toBeVisible()
  const url = dialog.getByLabel('Indirizzo (URL)')
  await expect(url).toBeFocused()

  // focus stays inside the modal dialog
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)

  await url.fill('javascript:alert(1)')
  await url.press('Enter')
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByText('Indirizzo non valido')).toBeVisible()
  expect(await html(page)).toBe('<p>sito</p>')

  await url.fill('www.esempio.it')
  await dialog.getByLabel('Apri in una nuova scheda').check()
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe(
    '<p><a href="https://www.esempio.it" target="_blank" rel="noopener noreferrer">sito</a></p>',
  )

  // cursor inside the link: the dialog shows it and can remove it
  await page.keyboard.press('ArrowLeft')
  await expect(button(page, 'Link')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+k')
  await expect(url).toHaveValue('https://www.esempio.it')
  await dialog.getByRole('button', { name: 'Rimuovi link' }).click()
  expect(await html(page)).toBe('<p>sito</p>')
})

test('Escape closes the link dialog without changes', async ({ page }) => {
  await page.keyboard.type('x')
  await button(page, 'Link').click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci link' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p>x</p>')
})

test('one indent button: nests list items, indents paragraphs', async ({ page }) => {
  await page.keyboard.press('Control+Shift+8')
  await page.keyboard.type('a')
  await page.keyboard.press('Enter')
  await page.keyboard.type('b')
  await button(page, 'Aumenta rientro').click()
  expect(await html(page)).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>')
  await button(page, 'Riduci rientro').click()
  expect(await html(page)).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
})
