import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione' })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Caratteri speciali ed emoji' })

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

const open = (page: Page) =>
  toolbar(page).getByRole('button', { name: 'Caratteri speciali ed emoji' }).click()

test('search by name and insert at the cursor (marks kept)', async ({ page }) => {
  await page.keyboard.press('Control+b')
  await page.keyboard.type('prezzo 10')
  await open(page)
  await expect(dialog(page).getByRole('textbox', { name: 'Cerca per nome' })).toBeFocused()
  await page.keyboard.type('euro')
  await dialog(page).getByRole('button', { name: 'euro', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p><strong>prezzo 10€</strong></p>')
})

test('categories as tabs, the grid with the arrow keys, Enter inserts; recent ones remembered', async ({
  page,
}) => {
  await open(page)
  const tabs = dialog(page).getByRole('tab')
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight') // Punteggiatura
  await expect(dialog(page).getByRole('tab', { name: 'Punteggiatura' })).toBeFocused()
  await expect(dialog(page).getByRole('tab', { name: 'Punteggiatura' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('End') // Simboli emoji
  await expect(dialog(page).getByRole('tabpanel', { name: 'Simboli emoji' })).toBeVisible()
  await dialog(page).getByRole('tab', { name: 'Faccine' }).click()
  const panel = dialog(page).getByRole('tabpanel', { name: 'Faccine' })
  await panel.getByRole('button').first().focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown') // one row = 10 characters
  await expect(panel.getByRole('button').nth(11)).toBeFocused()
  await expect(dialog(page).getByText(/U\+1F/)).toBeVisible() // preview with the code point
  const chosen = await panel.getByRole('button').nth(11).textContent()
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe(`<p>${chosen}</p>`)
  // reopened: the "Recenti" tab comes first with the character just used
  await open(page)
  await expect(dialog(page).getByRole('tab').first()).toHaveText('Recenti')
  await expect(
    dialog(page).getByRole('tabpanel', { name: 'Recenti' }).getByRole('button').first(),
  ).toHaveText(chosen!)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
})

test('no results message; emoji sequences insert whole', async ({ page }) => {
  await open(page)
  const search = dialog(page).getByRole('textbox', { name: 'Cerca per nome' })
  await search.fill('zzzz')
  await expect(dialog(page).getByText('Nessun carattere trovato')).toBeVisible()
  await search.fill('informatica')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe('<p>👩‍💻</p>')
  await page.keyboard.press('Backspace') // one grapheme: the whole sequence goes
  expect(await html(page)).toBe('<p></p>')
})
