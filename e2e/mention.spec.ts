import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const list = (page: Page) => page.getByRole('listbox', { name: 'Persone' })
const mention = (id: string, label: string) =>
  `<span class="scriba-mention" data-mention-id="${id}">@${label}</span>`

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

test('"@" lists people from the async source; typing filters; Enter inserts', async ({ page }) => {
  await page.keyboard.type('Ciao @')
  await expect(list(page)).toBeVisible()
  await expect(list(page).getByRole('option')).toHaveCount(4)
  await expect(editor(page)).toHaveAttribute('aria-controls', /scriba-mention/)
  await page.keyboard.type('bru')
  await expect(list(page).getByRole('option')).toHaveText(['Bruno BianchiGrafica'])
  await expect(list(page).getByRole('option')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(list(page)).toBeHidden()
  await page.keyboard.type('come va?')
  expect(await html(page)).toBe(`<p>Ciao ${mention('u-bruno', 'Bruno Bianchi')} come va?</p>`)
})

test('arrows and click choose; a name with a space keeps the list open', async ({ page }) => {
  await page.keyboard.type('@')
  await expect(list(page).getByRole('option')).toHaveCount(4)
  await page.keyboard.press('ArrowDown')
  await expect(list(page).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Tab')
  await page.keyboard.type('e @anna ro')
  await expect(list(page).getByRole('option')).toHaveText(['Anna RossiRedazione'])
  await list(page).getByRole('option').click()
  await expect(list(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe(
    `<p>${mention('u-bruno', 'Bruno Bianchi')} e ${mention('u-anna', 'Anna Rossi')} </p>`,
  )
})

test('no match: message, then a space goes on typing; Escape keeps the text', async ({ page }) => {
  await page.keyboard.type('@zzz')
  await expect(
    page.getByRole('status').filter({ hasText: 'Nessuna persona trovata' }),
  ).toBeVisible()
  await page.keyboard.type(' fine')
  await expect(list(page)).toBeHidden()
  await page.keyboard.type(' @car')
  await expect(list(page).getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(list(page)).toBeHidden()
  expect(await html(page)).toBe('<p>@zzz fine @car</p>')
})

test('not inside an e-mail address', async ({ page }) => {
  await page.keyboard.type('anna@esempio.it')
  await expect(list(page)).toBeHidden()
  expect(await html(page)).toBe('<p>anna@esempio.it</p>')
})

test('Backspace deletes the whole mention; Ctrl+Z brings it back', async ({ page }) => {
  await page.keyboard.type('@dar')
  await expect(list(page).getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await page.keyboard.type('ok')
  await page.waitForTimeout(600) // a pause: the deletion is a new undo step
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace') // the space
  await page.keyboard.press('Backspace') // the mention, in one go
  expect(await html(page)).toBe('<p></p>')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toContain(mention('u-dario', 'Dario Neri'))
})

test('arrows move over the mention as one character', async ({ page }) => {
  await page.keyboard.type('a @carla')
  await expect(list(page).getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await page.keyboard.type('b')
  await page.keyboard.press('ArrowLeft') // before "b"
  await page.keyboard.press('ArrowLeft') // before the space
  await page.keyboard.press('ArrowLeft') // before the mention
  await page.keyboard.type('X')
  expect(await html(page)).toBe(`<p>a X${mention('u-carla', 'Carla Verdi')} b</p>`)
})
