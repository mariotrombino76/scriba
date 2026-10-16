import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const task = (page: Page) => editor(page).getByRole('group', { name: /da fare|fatto/ })

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

test('"/attività" inserts a task drawn by Vue; fields by keyboard; back to the text', async ({
  page,
}) => {
  await page.keyboard.type('Lista')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/attivit')
  await page.keyboard.press('Enter')
  await expect(task(page)).toBeVisible()
  // the new task is selected: Enter goes into its first field
  await page.keyboard.press('Enter')
  await expect(task(page).getByRole('checkbox', { name: 'Fatto' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(task(page).getByRole('textbox', { name: 'Titolo' })).toBeFocused()
  await page.keyboard.type('Comprare il pane')
  await page.keyboard.press('Enter') // keeps it, back to the editor
  await expect(editor(page)).toBeFocused()
  await expect(task(page)).toHaveAccessibleName('Comprare il pane: da fare')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('dopo')
  expect(await html(page)).toBe(
    '<p>Lista</p><div class="scriba-task" data-task="" data-done="false">Comprare il pane</div><p>dopo</p>',
  )
  // and back up: the task is selected, then the text above it
  await page.keyboard.press('ArrowUp')
  await expect(editor(page).locator('.scriba-task-view.is-selected')).toHaveCount(1)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('!')
  expect(await html(page)).toContain('<p>Lista!</p>')
})

test('checkbox, due date, undo; an invalid date is refused', async ({ page }) => {
  await page.keyboard.type('/attivit')
  await page.keyboard.press('Enter')
  await task(page).getByRole('checkbox', { name: 'Fatto' }).click()
  await expect(task(page)).toHaveAccessibleName(/fatto$/)
  const due = task(page).getByRole('textbox', { name: /Scadenza/ })
  await due.fill('2026-02-30')
  await due.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Data non valida: usa AAAA-MM-GG')
  await due.fill('2030-01-15')
  await due.press('Enter')
  expect(await html(page)).toBe(
    '<div class="scriba-task" data-task="" data-done="true" data-due="2030-01-15"></div><p></p>',
  )
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).not.toContain('data-due')
  await expect(due).toHaveValue('')
})

test('Escape drops an unsaved title; Space on the selected task toggles it', async ({ page }) => {
  await page.keyboard.type('/attivit')
  await page.keyboard.press('Enter')
  const title = task(page).getByRole('textbox', { name: 'Titolo' })
  await title.click()
  await page.keyboard.type('da buttare')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toBeFocused()
  await expect(title).toHaveValue('')
  await page.keyboard.press(' ')
  await expect(task(page)).toHaveAccessibleName(/fatto$/)
  // Backspace deletes the selected task as a whole
  await page.keyboard.press('Backspace')
  await expect(task(page)).toHaveCount(0)
})
