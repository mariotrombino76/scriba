import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setReadOnly(on: boolean): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

const menubar = (page: Page) => page.getByRole('menubar', { name: 'Menu' })

async function fileMenu(page: Page, entry: string) {
  await menubar(page).getByRole('menuitem', { name: 'File' }).click()
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: entry }).click()
}

async function openWith(
  page: Page,
  name: string,
  content: string | Buffer,
  mimeType = 'text/plain',
) {
  const chooser = page.waitForEvent('filechooser')
  await fileMenu(page, 'Apri…')
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(content) })
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

test('open a Markdown file; unsaved changes are confirmed first', async ({ page }) => {
  await page.keyboard.type('bozza')
  const chooser = page.waitForEvent('filechooser')
  await fileMenu(page, 'Apri…')
  await (
    await chooser
  ).setFiles({
    name: 'n.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Nota\n\n- **uno**'),
  })
  const ask = page.getByRole('dialog', { name: 'Modifiche non salvate' })
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('button', { name: 'Annulla' })).toBeFocused() // the safe choice
  await ask.getByRole('button', { name: 'Continua senza salvare' }).click()
  await expect
    .poll(() => html(page))
    .toBe('<h1>Nota</h1><ul><li><p><strong>uno</strong></p></li></ul>')
  await expect(page.getByRole('status').filter({ hasText: 'n.md aperto' })).toBeAttached()
  // just opened: nothing to confirm, and Ctrl+Z goes back to the previous document
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe('<p>bozza</p>')
})

test('hostile HTML file: opened through the schema, nothing runs', async ({ page }) => {
  // Chromium logs a CSP report as soon as an inert DOMParser document contains an on*
  // attribute, although nothing runs (verified with and without CSP); the alert probe
  // below is what proves nothing ran.
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  await page.evaluate(() => {
    const w = window as unknown as { alerts: number }
    w.alerts = 0
    window.alert = () => void w.alerts++
  })
  await openWith(
    page,
    'x.html',
    '<h1 onclick="alert(1)">T</h1><img src="data:image/svg+xml,<svg onload=alert(1)>" onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">l</a>',
    'text/html',
  )
  await expect.poll(() => html(page)).toBe('<h1>T</h1><p>l</p>')
  await editor(page).getByText('l', { exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { alerts: number }).alerts)).toBe(0)
  // the same Chromium report, as a securitypolicyviolation event: drop only that one
  await page.evaluate(() => {
    const list = (window as unknown as { scriba: Scriba }).scriba.cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
  await openWith(page, 'x.pdf', '%PDF')
  await expect(page.getByRole('alert')).toHaveText(/tipo di file non supportato/)
})

test('download as HTML and as Word, then open the Word file again', async ({ page }) => {
  await page.keyboard.type('# Verbale')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Testo con ')
  await page.keyboard.press('Control+b')
  await page.keyboard.type('grassetto')
  const htmlDownload = page.waitForEvent('download')
  await fileMenu(page, 'Scarica come HTML')
  const h = await htmlDownload
  expect(h.suggestedFilename()).toBe('Verbale.html')
  const page1 = readFileSync((await h.path())!, 'utf8')
  expect(page1).toContain('<title>Verbale</title>')
  expect(page1).toContain('<h1>Verbale</h1><p>Testo con <strong>grassetto</strong></p>')
  const wordDownload = page.waitForEvent('download')
  await fileMenu(page, 'Scarica come Word (.docx)')
  const w = await wordDownload
  expect(w.suggestedFilename()).toBe('Verbale.docx')
  const bytes = readFileSync((await w.path())!)
  expect(bytes.subarray(0, 2).toString()).toBe('PK') // a zip
  // saved: opening another file asks nothing
  await openWith(
    page,
    'Verbale.docx',
    bytes,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  await expect(page.getByRole('dialog', { name: 'Modifiche non salvate' })).toHaveCount(0)
  await expect
    .poll(() => html(page))
    .toBe('<h1>Verbale</h1><p>Testo con <strong>grassetto</strong></p>')
})

test('preview and print show only the document', async ({ page }) => {
  await page.keyboard.type('Da stampare')
  await fileMenu(page, 'Anteprima')
  const preview = page.getByRole('dialog', { name: 'Anteprima' })
  await expect(preview.getByRole('document')).toHaveText('Da stampare')
  await preview.getByRole('button', { name: 'Chiudi' }).click()
  await expect(editor(page)).toBeFocused()
  // print: the browser dialog is replaced by a probe
  await page.evaluate(() => {
    const w = window as unknown as { printed?: string }
    window.print = () => {
      w.printed = document.querySelector('.scriba-print')?.textContent ?? ''
      w.printed += document.documentElement.classList.contains('scriba-printing') ? '|on' : '|off'
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  await page.keyboard.press('Control+p')
  expect(await page.evaluate(() => (window as unknown as { printed?: string }).printed)).toBe(
    'Da stampare|on',
  )
  expect(await page.locator('.scriba-print').count()).toBe(0)
})

test('a text file dropped on the editor is opened', async ({ page }) => {
  await editor(page).evaluate((el) => {
    const data = new DataTransfer()
    data.items.add(new File(['riga uno\nriga due'], 'note.txt', { type: 'text/plain' }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  })
  await expect.poll(() => html(page)).toBe('<p>riga uno</p><p>riga due</p>')
})

test('read-only: opening is off, downloading and printing are on', async ({ page }) => {
  await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.setReadOnly(true))
  await menubar(page).getByRole('menuitem', { name: 'File' }).click()
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu.getByRole('menuitem', { name: 'Apri…' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(menu.getByRole('menuitem', { name: 'Nuovo documento' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(menu.getByRole('menuitem', { name: 'Scarica come HTML' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
  await expect(menu.getByRole('menuitem', { name: 'Stampa…' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )
})

test('a draft survives a reload: File ▸ Restore last draft', async ({ page }) => {
  await page.keyboard.type('testo non salvato')
  await page.waitForTimeout(600) // the draft is written 300 ms after the last change
  await page.reload()
  await editor(page).click()
  expect(await html(page)).not.toContain('testo non salvato')
  await fileMenu(page, "Ripristina l'ultima bozza")
  await expect.poll(() => html(page)).toBe('<p>testo non salvato</p>')
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).not.toContain('testo non salvato')
})

test('a document with protected blocks cannot be replaced: the dialog says why', async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as unknown as { scriba: { setHTML(s: string): void } }).scriba.setHTML(
      '<p>libero</p><p data-block-id="lock-1">protetto</p>',
    ),
  )
  await menubar(page).getByRole('menuitem', { name: 'File' }).click()
  await page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem', { name: 'Nuovo documento' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Impossibile sostituire il documento' })
  await expect(dialog).toContainText('blocchi protetti')
  await expect(dialog.getByRole('button', { name: 'Chiudi' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(editor(page)).toBeFocused()
  expect(await html(page)).toBe('<p>libero</p><p data-block-id="lock-1">protetto</p>')
})
