import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const setReadOnly = (page: Page, on: boolean) =>
  page.evaluate(
    (value) =>
      (window as unknown as { scriba: { setReadOnly(v: boolean): void } }).scriba.setReadOnly(
        value,
      ),
    on,
  )
/** Synthetic paste (Firefox drops data of synthetic ClipboardEvents). */
const paste = (page: Page, data: Record<string, string>) =>
  page.evaluate((data) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  }, data)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Trova e sostituisci' })
const TEXT = '<p>Ciao mondo, ciao a tutti</p>'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
  await page.keyboard.type('Ciao mondo, ciao a tutti')
  await setReadOnly(page, true)
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

test('typing, deleting, shortcuts, undo, paste and drop change nothing', async ({ page }) => {
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
  await editor(page).click()
  await page.keyboard.type('xyz')
  for (const key of ['Backspace', 'Delete', 'Enter', 'Control+a', 'Control+b', 'Control+z'])
    await page.keyboard.press(key)
  await page.keyboard.type('/tab @an')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await paste(page, { 'text/html': '<p>incollato</p>', 'text/plain': 'incollato' })
  await editor(page).evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/html', '<p>incollato</p>')
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true }))
  })
  expect(await html(page)).toBe(TEXT)
})

test('reachable with Tab; editing controls disabled, find and full screen usable', async ({
  page,
}) => {
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(editor(page)).toBeFocused()
  await expect(toolbar(page).getByRole('button', { name: 'Grassetto' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(toolbar(page).getByRole('button', { name: /^Trova/ })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  await expect(toolbar(page).getByRole('button', { name: 'Schermo intero' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  // Ctrl+F works: search yes, replace no
  await editor(page).click()
  await page.keyboard.press('Control+f')
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('textbox', { name: 'Trova' }).fill('ciao')
  await expect(panel(page).getByRole('status')).toContainText('2')
  await expect(panel(page).getByRole('button', { name: 'Sostituisci tutto' })).toBeDisabled()
  await page.keyboard.press('Escape')
  // full screen with the keyboard
  await editor(page).click()
  await page.keyboard.press('Control+Shift+f')
  await expect(toolbar(page).getByRole('button', { name: 'Schermo intero' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  expect(await html(page)).toBe(TEXT)
})

test('narrow toolbar: entries in "More options" are disabled too', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 })
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await toolbar(page).getByRole('button', { name: 'Altre opzioni' }).click()
  const menu = page.getByRole('menu', { name: 'Altre opzioni' })
  const quote = menu.getByRole('menuitemcheckbox', { name: 'Citazione' })
  await expect(quote).toHaveAttribute('aria-disabled', 'true')
  await quote.click({ force: true })
  expect(await html(page)).toBe(TEXT)
})

test('back to editable: typing works again', async ({ page }) => {
  await setReadOnly(page, false)
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'false')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  expect(await html(page)).toBe('<p>Ciao mondo, ciao a tutti!</p>')
  await expect(toolbar(page).getByRole('button', { name: 'Grassetto' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
})
