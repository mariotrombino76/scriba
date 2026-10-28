import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  setHTML(source: string): void
  setReadOnly(on: boolean): void
  cspViolations: string[]
}
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Inserisci modello' })
const menuItem = (page: Page) =>
  page.getByRole('menu', { name: 'Inserisci' }).getByRole('menuitem', { name: 'Modello…' })

async function openTemplates(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await menuItem(page).click()
  await expect(dialog(page)).toBeVisible()
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

test('Inserisci ▸ Modello: choose with the arrows, preview, insert with Enter', async ({
  page,
}) => {
  await setHTML(page, '<p>Introduzione</p>')
  await editor(page).getByText('Introduzione').click()
  await page.keyboard.press('End')
  await openTemplates(page)
  const d = dialog(page)
  const list = d.getByRole('group', { name: 'Modelli' })
  const preview = d.getByRole('textbox', { name: 'Anteprima del modello' })

  // the first template is chosen and focused, its placeholders filled
  await expect(list.getByRole('radio', { name: 'Verbale di riunione' })).toBeFocused()
  await expect(d.getByText('Titolo, data, partecipanti e decisioni.')).toBeVisible()
  await expect(preview.getByRole('heading', { name: 'Verbale di riunione' })).toBeVisible()
  await expect(preview).toContainText('Azienda: Ditta Esempio')
  await expect(preview).toHaveAttribute('contenteditable', 'false')

  // a template loaded from the "server"
  await page.keyboard.press('ArrowDown')
  await expect(list.getByRole('radio', { name: 'Lettera' })).toBeChecked()
  await expect(d.getByRole('status')).toHaveText('Caricamento…')
  await expect(d.getByRole('button', { name: 'Inserisci' })).toBeDisabled()
  await expect(preview).toContainText('Gentile cliente,')
  await expect(d.getByRole('button', { name: 'Inserisci' })).toBeEnabled()

  // one that cannot be loaded
  await page.keyboard.press('ArrowDown')
  await expect(d.getByRole('alert')).toHaveText(
    'Impossibile caricare il modello «Modello non disponibile».',
  )
  await expect(d.getByRole('button', { name: 'Inserisci' })).toBeDisabled()

  // back to the first one (cached), Enter inserts it after the paragraph
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(preview.getByRole('heading', { name: 'Verbale di riunione' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(d).toBeHidden()
  await expect(editor(page)).toBeFocused()
  const result = await html(page)
  expect(result).toMatch(
    /^<p>Introduzione<\/p><h2>Verbale di riunione<\/h2><p><strong>Azienda:<\/strong> Ditta Esempio<\/p><p><strong>Data:<\/strong> \d{1,2} \w+ \d{4}<\/p><h3>Partecipanti<\/h3>/,
  )

  // one undo step
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p>Introduzione</p>')
})

test('Escape closes without inserting; read-only disables the entry', async ({ page }) => {
  await setHTML(page, '<p>testo</p>')
  await openTemplates(page)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p>testo</p>')

  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await expect(menuItem(page)).toBeDisabled()
  await page.keyboard.press('Escape')
})
