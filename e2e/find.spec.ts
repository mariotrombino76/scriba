import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Trova e sostituisci' })

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

async function setup(page: Page) {
  await page.keyboard.type('Il gatto e il Gatto.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Un gattone, un gatto.')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Control+f')
  await expect(panel(page)).toBeVisible()
  const find = panel(page).getByRole('textbox', { name: 'Trova' })
  await expect(find).toBeFocused()
  return find
}

test('highlights matches, Enter / Shift+Enter move, Escape selects the match', async ({ page }) => {
  const find = await setup(page)
  await find.fill('gatto')
  const status = panel(page).getByRole('status')
  await expect(status).toHaveText('1 di 4')
  await expect(editor(page).locator('.scriba-find-match')).toHaveCount(4)
  await expect(editor(page).locator('.scriba-find-current')).toHaveText('gatto')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('2 di 4')
  await expect(editor(page).locator('.scriba-find-current')).toHaveText('Gatto')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Shift+Enter')
  await expect(status).toHaveText('4 di 4')
  // options
  await panel(page).getByLabel('Maiuscole/minuscole').check()
  await expect(status).toHaveText(/di 3$/)
  await panel(page).getByLabel('Parole intere').check()
  await expect(status).toHaveText(/di 2$/)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
  await expect(editor(page).locator('.scriba-find-match')).toHaveCount(0)
  await page.keyboard.type('cane') // the current match was selected: typing replaces it
  expect(await html(page)).toContain('cane')
})

test('replace one and replace all (one undo step)', async ({ page }) => {
  const find = await setup(page)
  await find.fill('gatto')
  await expect(panel(page).getByRole('status')).toHaveText('1 di 4') // search done
  const replace = panel(page).getByRole('textbox', { name: 'Sostituisci con' })
  await replace.fill('cane')
  await panel(page).getByRole('button', { name: 'Sostituisci', exact: true }).click()
  await expect(panel(page).getByRole('status')).toHaveText('1 di 3')
  expect(await html(page)).toBe('<p>Il cane e il Gatto.</p><p>Un gattone, un gatto.</p>')
  await panel(page).getByRole('button', { name: 'Sostituisci tutto' }).click()
  await expect(panel(page).getByRole('status')).toHaveText('3 sostituzioni')
  expect(await html(page)).toBe('<p>Il cane e il cane.</p><p>Un canene, un cane.</p>')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p>Il cane e il Gatto.</p><p>Un gattone, un gatto.</p>')
})

test('regular expressions with groups; invalid expressions are reported', async ({ page }) => {
  const find = await setup(page)
  await panel(page).getByLabel('Espressione regolare').check()
  await find.fill('(\\w+) (gatt\\w*)')
  await expect(panel(page).getByRole('status')).toHaveText(/di 4$/)
  await panel(page).getByRole('textbox', { name: 'Sostituisci con' }).fill('$2 $1')
  await panel(page).getByRole('button', { name: 'Sostituisci tutto' }).click()
  expect(await html(page)).toBe('<p>gatto Il e Gatto il.</p><p>gattone Un, gatto un.</p>')
  await find.fill('(')
  await expect(panel(page).getByRole('status')).toHaveText('Espressione regolare non valida')
  await expect(find).toHaveAttribute('aria-invalid', 'true')
})

test('a catastrophic regex is stopped and the page stays responsive (§5.10)', async ({
  page,
  browserName,
}) => {
  await page.keyboard.type('a'.repeat(40) + 'b')
  await page.keyboard.press('Control+f')
  await panel(page).getByLabel('Espressione regolare').check()
  await panel(page).getByRole('textbox', { name: 'Trova' }).fill('(a+)+$')
  // V8 and SpiderMonkey would hang: the worker is stopped after 1 s. WebKit's engine has
  // its own backtracking limit and gives up by itself in ~0.5 s (no match): fine as well.
  await expect(panel(page).getByRole('status')).toHaveText(
    browserName === 'webkit'
      ? /troppo lenta ed è stata interrotta|Nessun risultato/
      : 'L’espressione è troppo lenta ed è stata interrotta: semplificala',
    { timeout: 4000 },
  )
  // the main thread was never blocked
  const t0 = Date.now()
  expect(await page.evaluate(() => 1 + 1)).toBe(2)
  expect(Date.now() - t0).toBeLessThan(500)
  // and a normal search works again afterwards (a fresh worker)
  await panel(page).getByRole('textbox', { name: 'Trova' }).fill('a+b')
  await expect(panel(page).getByRole('status')).toHaveText('1 di 1')
})

test('toolbar button opens the panel with the selected text', async ({ page }) => {
  await page.keyboard.type('trova questo')
  await page.keyboard.press('Shift+Home')
  await toolbar(page).getByRole('button', { name: 'Trova e sostituisci' }).click()
  await expect(panel(page).getByRole('textbox', { name: 'Trova' })).toHaveValue('trova questo')
  await expect(panel(page).getByRole('status')).toHaveText('1 di 1')
  await panel(page).getByRole('button', { name: 'Chiudi' }).click()
  await expect(panel(page)).toBeHidden()
})
