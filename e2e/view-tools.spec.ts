import { expect, test, type Page } from '@playwright/test'

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
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
  expect(
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

test('word counter: updates while typing, dialog with document and selection', async ({ page }) => {
  const counter = page.getByRole('button', { name: /parol[ae]$/ })
  await expect(counter).toHaveText('0 parole')
  await page.keyboard.type("Ciao l'albero")
  await expect(counter).toHaveText('2 parole')
  await page.keyboard.press('Enter')
  await page.keyboard.type('uno')
  await expect(counter).toHaveText('3 parole')
  await page.keyboard.press('Shift+Home') // select "uno"
  await counter.click()
  const dialog = page.getByRole('dialog', { name: 'Conteggio parole' })
  const row = (name: string) => dialog.getByRole('row', { name: new RegExp(`^${name}`) })
  await expect(row('Parole')).toHaveText(/Parole\s*3\s*1/)
  await expect(row('Caratteri \\(spazi esclusi\\)')).toHaveText(/\(spazi esclusi\)\s*15\s*3/)
  await expect(dialog.getByRole('button', { name: 'Chiudi' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
})

test('fullscreen: button, Escape, Ctrl+Shift+F; the page does not scroll behind', async ({
  page,
}) => {
  const button = toolbar(page).getByRole('button', { name: 'Schermo intero' })
  const app = page.locator('#app')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await button.click()
  await expect(app).toHaveClass(/scriba-fullscreen/)
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveClass(/scriba-fullscreen-open/)
  await expect(editor(page)).toBeFocused()
  const box = (await app.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.width).toBeCloseTo(viewport.width, 0)
  expect(box.height).toBeCloseTo(viewport.height, 0)
  // typing still works
  await page.keyboard.type('testo')
  await page.keyboard.press('Escape')
  await expect(app).not.toHaveClass(/scriba-fullscreen/)
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+Shift+F')
  await expect(app).toHaveClass(/scriba-fullscreen/)
  await page.keyboard.press('Control+Shift+F')
  await expect(app).not.toHaveClass(/scriba-fullscreen/)
  await expect(page.locator('html')).not.toHaveClass(/scriba-fullscreen-open/)
})

test('menus and dialogs still work in fullscreen', async ({ page }) => {
  await page.keyboard.press('Control+Shift+F')
  await toolbar(page).getByRole('button', { name: 'Inserisci tabella', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Inserisci tabella' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Altre dimensioni…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci tabella' })
  await expect(dialog).toBeVisible()
  // Escape closes the dialog first, not fullscreen
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#app')).toHaveClass(/scriba-fullscreen/)
})
