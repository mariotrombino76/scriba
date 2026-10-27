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
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const checker = (page: Page) => page.getByRole('dialog', { name: 'Verifica accessibilità' })
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function openChecker(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Strumenti' })
    .click()
  await page
    .getByRole('menu', { name: 'Strumenti' })
    .getByRole('menuitem', { name: 'Verifica accessibilità…' })
    .click()
  await expect(checker(page)).toBeVisible()
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

test('Strumenti ▸ Verifica accessibilità: fixes the issues one by one, by keyboard', async ({
  page,
}) => {
  await setHTML(
    page,
    `<h2>Programma</h2><p><img src="${PNG}"></p><h4>Orari</h4><p>- mattina</p><p>- pomeriggio</p>`,
  )
  await openChecker(page)
  const dialog = checker(page)
  await expect(dialog.getByRole('status')).toHaveText('Problema 1 di 3.')
  await expect(
    dialog.getByRole('heading', { name: 'Immagine senza testo alternativo' }),
  ).toBeVisible()
  await expect(dialog.getByText('Errore', { exact: true })).toBeVisible()
  // the image is selected in the editor, visible behind the dialog
  await expect(editor(page).locator('img.scriba-selected-node')).toHaveCount(1)
  await expect(
    dialog.getByRole('link', { name: /1\.1\.1 Contenuti non testuali/ }),
  ).toHaveAttribute('href', 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html')

  // the field has the focus: write and press Enter
  const alt = dialog.getByRole('textbox', { name: 'Testo alternativo' })
  await expect(alt).toBeFocused()
  await alt.fill('Mappa della sede')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('status')).toHaveText('Corretto. Problema 1 di 2.')

  // skipped heading level: choose the level
  await expect(dialog.getByRole('heading', { name: 'Livello del titolo saltato' })).toBeVisible()
  await expect(editor(page).locator('.scriba-a11y-current')).toHaveText('Orari')
  const level = dialog.getByRole('group', { name: 'Livello del titolo' })
  await expect(level.getByRole('radio', { name: 'Titolo 3' })).toBeChecked()
  await expect(level.getByRole('radio', { name: 'Titolo 3' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Correggi' }).click()

  // hand-written list: one click
  await expect(dialog.getByRole('heading', { name: 'Elenco scritto a mano' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Trasforma in elenco puntato' }).click()
  await expect(dialog.getByRole('status')).toHaveText(
    'Corretto. Nessun problema di accessibilità trovato.',
  )
  await expect(dialog.getByRole('button', { name: 'Chiudi' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  await expect(editor(page).locator('.scriba-a11y-current')).toHaveCount(0)
  expect(await html(page)).toBe(
    `<h2>Programma</h2><p><img src="${PNG}" alt="Mappa della sede"></p><h3>Orari</h3><ul><li><p>mattina</p></li><li><p>pomeriggio</p></li></ul>`,
  )
  // every repair is one undo step
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toContain('<p>- mattina</p>')
})

test('Previous / Next / Ignore, contrast with the suggested color', async ({ page }) => {
  await setHTML(page, '<p>Leggi <a href="https://example.com">qui</a>.</p><p>giallo su blu</p>')
  // colors from the toolbar palettes: yellow text on a blue highlight is 3.47:1
  await editor(page).getByText('giallo su blu').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  for (const [menu, color] of [
    ['Colore testo', 'Giallo'],
    ['Colore evidenziazione', 'Blu'],
  ]) {
    await toolbar(page).getByRole('button', { name: menu, exact: true }).click()
    await page.getByRole('menu', { name: menu }).getByRole('menuitemradio', { name: color }).click()
  }
  await expect
    .poll(() => html(page))
    .toContain('<span style="color: #a16207"><span style="background-color: #bfdbfe">')

  await openChecker(page)
  const dialog = checker(page)
  await expect(dialog.getByRole('heading', { name: 'Testo del link poco chiaro' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Precedente' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Successivo' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Problema 2 di 2.')
  await expect(dialog.getByText(/contrasto di 3\.4\d:1; ne serve almeno 4\.5:1/)).toBeVisible()
  await expect(editor(page).locator('.scriba-a11y-current')).toHaveText('giallo su blu')
  await dialog.getByRole('button', { name: /^Usa il colore #/ }).click()
  await expect(dialog.getByRole('status')).toHaveText('Corretto. Problema 1 di 1.')
  expect(await html(page)).toMatch(
    /<span style="color: #[0-9a-f]{6}"><span style="background-color: #bfdbfe">giallo su blu/,
  )
  expect(await html(page)).not.toContain('#a16207')

  await dialog.getByRole('button', { name: 'Ignora' }).click()
  await expect(dialog.getByRole('status')).toHaveText(
    'Ignorato. Nessun problema di accessibilità trovato.',
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  // ignored for this session: opening again does not show it
  await openChecker(page)
  await expect(checker(page).getByRole('status')).toHaveText(
    'Nessun problema di accessibilità trovato.',
  )
})

test('read-only: the issues are shown, the repairs are not', async ({ page }) => {
  await setHTML(page, `<p><img src="${PNG}"></p>`)
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await openChecker(page)
  const dialog = checker(page)
  await expect(
    dialog.getByRole('heading', { name: 'Immagine senza testo alternativo' }),
  ).toBeVisible()
  await expect(dialog.getByRole('group', { name: 'Correzione' })).toHaveCount(0)
  await expect(dialog.getByText(/sola lettura/)).toBeVisible()
})
