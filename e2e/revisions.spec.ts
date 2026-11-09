import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  saved: string[]
  setReadOnly(on: boolean): void
  cspViolations: string[]
}
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Cronologia versioni' })

async function openHistory(page: Page) {
  await page.getByRole('menubar', { name: 'Menu' }).getByRole('menuitem', { name: 'File' }).click()
  await page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem', { name: 'Cronologia versioni…' })
    .click()
  await expect(dialog(page)).toBeVisible()
  return dialog(page)
}

/** Replaces the whole text and saves it (Ctrl+S): one more version. */
async function writeAndSave(page: Page, text: string, count: number) {
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(text)
  await page.keyboard.press('ControlOrMeta+s')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.saved.length))
    .toBe(count)
}

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

test('no versions yet', async ({ page }) => {
  const d = await openHistory(page)
  await expect(d.getByText('Nessuna versione salvata')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Chiudi' })).toBeFocused()
  await expect(d.getByRole('button', { name: 'Ripristina questa versione' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
  await expect(editor(page)).toBeFocused()
})

test('compare, step through the differences, restore, undo', async ({ page }) => {
  await writeAndSave(page, 'Il gatto nero dorme.', 1)
  await writeAndSave(page, 'Il gatto bianco dorme.', 2)
  await page.keyboard.type(' Sogna.')
  const current = await html(page)
  expect(current).toBe('<p>Il gatto bianco dorme. Sogna.</p>')

  const d = await openHistory(page)
  const versions = d.getByRole('group', { name: 'Versioni salvate' }).getByRole('radio')
  await expect(versions).toHaveCount(2)
  // newest first, focused; names from the server shown as text, never as markup
  await expect(versions.first()).toBeFocused()
  await expect(versions.first()).toBeChecked()
  await expect(d.getByText('Bruno <b>Bianchi</b>')).toBeVisible()
  const preview = d.getByRole('region', { name: 'Anteprima della versione' })
  await expect(preview.locator('.scriba-diff-insert')).toHaveText([' Sogna.'])
  await expect(d.getByText('Differenze: 1')).toBeVisible()

  // the older version: arrows move between the radios
  await page.keyboard.press('ArrowDown')
  await expect(versions.nth(1)).toBeChecked()
  await expect(d.getByText('Differenze: 3')).toBeVisible()
  await expect(preview.locator('.scriba-diff-delete')).toHaveText(['nero'])
  await expect(preview.locator('.scriba-diff-insert')).toHaveText(['bianco', ' Sogna.'])
  await d.getByRole('button', { name: 'Differenza successiva' }).click()
  await expect(d.getByText('Differenza 1 di 3, tolto dopo: «nero»')).toBeVisible()
  await expect(preview.locator('.scriba-diff-current')).toHaveText('nero')
  await d.getByRole('button', { name: 'Differenza precedente' }).click()
  await expect(d.getByText('Differenza 3 di 3, aggiunto dopo: «Sogna.»')).toBeVisible()

  // the version as it was
  await d.getByLabel('Evidenzia le differenze con il documento attuale').uncheck()
  await expect(preview.getByText('Il gatto nero dorme.', { exact: true })).toBeVisible()
  await expect(preview.locator('.scriba-diff-insert, .scriba-diff-delete')).toHaveCount(0)
  await expect(d.getByRole('button', { name: 'Differenza successiva' })).toBeHidden()
  // the preview cannot be edited
  await expect(preview.getByRole('textbox')).toHaveAttribute('contenteditable', 'false')

  await d.getByRole('button', { name: 'Ripristina questa versione' }).click()
  await expect(d).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p>Il gatto nero dorme.</p>')
  // one undo step
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => html(page)).toBe(current)
})

test('read-only: versions can be compared, not restored', async ({ page }) => {
  await writeAndSave(page, 'prima', 1)
  await page.keyboard.type(' dopo')
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  const d = await openHistory(page)
  await expect(
    d.getByRole('region', { name: 'Anteprima della versione' }).locator('.scriba-diff-insert'),
  ).toHaveText([' dopo'])
  await expect(d.getByRole('button', { name: 'Ripristina questa versione' })).toBeDisabled()
})
