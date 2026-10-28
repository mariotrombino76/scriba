import { expect, test, type Page } from '@playwright/test'

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    // Chromium applies the page CSP to the inert DOMParser document too: hostile
    // handlers/styles there are reported as *blocked* (never run). Running code
    // would show up as an alert() dialog, checked below.
    if (/^(Executing inline event handler|Applying inline style) violates/.test(m.text())) return
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('dialog', (d) => errors.push(`dialog: ${d.message()}`)) // an alert() would mean XSS
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
})

async function openSource(page: Page) {
  await toolbar(page).getByRole('button', { name: 'Codice sorgente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Codice sorgente HTML' })
  await expect(dialog).toBeVisible()
  return { dialog, area: dialog.getByRole('textbox', { name: 'HTML' }) }
}

test('shows the HTML, saves edits as one undo step', async ({ page }) => {
  await page.keyboard.type('ciao')
  const { dialog, area } = await openSource(page)
  await expect(area).toBeFocused()
  await expect(area).toHaveValue('<p>ciao</p>')
  // the text area fits in the dialog: no horizontal scroll bar
  expect(await dialog.evaluate((d) => d.scrollWidth - d.clientWidth)).toBe(0)
  await area.fill('<h2>Titolo</h2>\n<p>testo <em>nuovo</em></p>')
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<h2>Titolo</h2><p>testo <em>nuovo</em></p>')
  await page.keyboard.press('Control+z')
  expect(await html(page)).toBe('<p>ciao</p>')
})

test('hostile HTML is cleaned on save and never runs', async ({ page }) => {
  const { dialog, area } = await openSource(page)
  await area.fill(
    '<p onclick="alert(1)">ok<img src="javascript:alert(1)" onerror="alert(1)"><script>alert(1)</script>' +
      '<a href="javascript:alert(1)">link</a></p><iframe src="javascript:alert(1)"></iframe>' +
      '<svg onload="alert(1)"></svg><style>body{display:none}</style>',
  )
  await dialog.getByRole('button', { name: 'Salva' }).click()
  expect(await html(page)).toBe('<p>oklink</p>')
  await page.waitForTimeout(300) // an injected handler would fire by now
})

test('Escape or Cancel leave the document unchanged', async ({ page }) => {
  await page.keyboard.type('fermo')
  const { dialog, area } = await openSource(page)
  await area.fill('<p>cambiato</p>')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await html(page)).toBe('<p>fermo</p>')
  const again = await openSource(page)
  await again.area.fill('<p>cambiato</p>')
  await again.dialog.getByRole('button', { name: 'Annulla' }).click()
  expect(await html(page)).toBe('<p>fermo</p>')
})
