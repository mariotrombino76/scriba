import { expect, test, type Page } from '@playwright/test'

type Scriba = { setReadOnly(on: boolean): void; cspViolations: string[] }
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const help = (page: Page) => page.getByRole('dialog', { name: 'Scorciatoie da tastiera' })

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

test('Aiuto ▸ Scorciatoie da tastiera: tables, search, Escape back to the editor', async ({
  page,
}) => {
  const bar = page.getByRole('menubar', { name: 'Menu' })
  await bar.getByRole('menuitem', { name: 'Aiuto' }).click()
  await page
    .getByRole('menu', { name: 'Aiuto' })
    .getByRole('menuitem', { name: 'Scorciatoie da tastiera…' })
    .click()
  const dialog = help(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('searchbox', { name: 'Cerca una scorciatoia' })).toBeFocused()
  // the toolbar's own shortcuts, and the keys without a button
  const commands = dialog.getByRole('table', { name: 'Comandi' })
  await expect(commands.getByRole('row', { name: /Grassetto/ })).toContainText('Ctrl+B')
  await expect(commands.getByRole('row', { name: /Link/ }).first()).toContainText('Ctrl+K')
  await expect(dialog.getByRole('table', { name: 'Markdown mentre scrivi' })).toContainText(
    '**testo**',
  )
  await expect(dialog.getByRole('table', { name: 'Navigazione' })).toContainText('Maiusc+F10')
  await page.keyboard.type('incolla')
  await expect(dialog.getByRole('row').filter({ visible: true })).toHaveCount(2) // header + 1
  await expect(dialog.getByRole('row', { name: /Incolla come testo semplice/ })).toContainText(
    'Ctrl+Maiusc+V',
  )
  await page.keyboard.press('Enter') // does not close it
  await expect(dialog).toBeVisible()
  // Escape: a search field with text is cleared first (Chromium, Firefox), then the dialog closes
  const search = dialog.getByRole('searchbox', { name: 'Cerca una scorciatoia' })
  await page.keyboard.press('Escape')
  if (await dialog.count()) {
    await expect(search).toHaveValue('')
    await page.keyboard.press('Escape')
  }
  await expect(dialog).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
})

test('Alt+0 opens it, also read-only', async ({ page }) => {
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await editor(page).focus()
  await page.keyboard.press('Alt+0')
  await expect(help(page)).toBeVisible()
  await help(page).getByRole('button', { name: 'Chiudi' }).click()
  await expect(editor(page)).toBeFocused()
})
