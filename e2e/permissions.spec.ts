import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(html: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
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
const DOC =
  '<p data-block-id="free-1">Libero</p><p data-block-id="lock-1">Clausola fissa</p><p>Fine</p>'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await setHTML(page, DOC)
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('a protected block is marked and cannot be typed into', async ({ page }) => {
  const locked = editor(page).locator('p.scriba-locked')
  await expect(locked).toHaveText('Clausola fissa')
  await locked.click()
  await page.keyboard.type('xyz')
  await expect(
    page.getByRole('status').filter({ hasText: 'Questo blocco è protetto' }),
  ).toBeVisible()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  expect(await html(page)).toBe(DOC)
})

test('editing around it works; deleting across it is refused with a message', async ({ page }) => {
  await editor(page).getByText('Libero').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' sì')
  await editor(page).getByText('Fine').click()
  await page.keyboard.press('Home')
  await page.keyboard.type('Alla ')
  // select from the first block to the last one, then delete
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await expect(
    page.getByRole('status').filter({ hasText: 'Questo blocco è protetto' }),
  ).toBeVisible()
  expect(await html(page)).toBe(
    '<p data-block-id="free-1">Libero sì</p><p data-block-id="lock-1">Clausola fissa</p><p>Alla Fine</p>',
  )
  // Backspace at the start of the next block does not merge it into the protected one
  await editor(page).getByText('Alla Fine').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await html(page)).toContain('<p data-block-id="lock-1">Clausola fissa</p><p>Alla Fine</p>')
})

test('the toolbar cannot format it', async ({ page }) => {
  await editor(page).getByText('Libero').click()
  await page.keyboard.press('Control+a')
  await page.getByRole('toolbar', { name: 'Formattazione', exact: true }).getByRole('button', { name: 'Grassetto' }).click() // prettier-ignore
  expect(await html(page)).toBe(DOC)
})

test('a pasted copy of a protected block loses its id', async ({ page }) => {
  await editor(page).getByText('Fine').click()
  await page.keyboard.press('End')
  await paste(page, { 'text/html': '<p data-block-id="lock-1">Clausola fissa</p><p>bis</p>' })
  await expect.poll(() => html(page)).toContain('<p>FineClausola fissa</p><p>bis</p>')
  expect((await html(page)).match(/lock-1/g)).toHaveLength(1)
})
