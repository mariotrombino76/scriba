import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const WORD = readFileSync(new URL('./fixtures/word.html', import.meta.url), 'utf8')
const GDOCS = readFileSync(new URL('./fixtures/gdocs.html', import.meta.url), 'utf8')

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

/** Synthetic paste (same code path as a real one; Firefox drops data of synthetic ClipboardEvents). */
async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  }, data)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
})

test('Word in the middle of a paragraph: real lists, sewn edges', async ({ page }) => {
  await page.keyboard.type('primaDOPO')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  await paste(page, { 'text/html': WORD, 'text/plain': 'ignored' })
  const out = await html(page)
  expect(out).toContain(
    '<ul><li><p>Primo</p><ul><li><p>Sotto</p></li></ul></li><li><p>Secondo</p></li></ul>',
  )
  expect(out).toContain('<ol><li><p>Uno</p></li><li><p>Due</p></li></ol>')
  expect(out).not.toMatch(/Calibri|mso-|o:p|·/)
  // the first pasted block joins the text before the cursor, the last one the text after
  expect(out.startsWith('<p>primaVerbale</p>')).toBe(true)
  expect(out.endsWith('<p>DueDOPO</p>') || out.includes('Due</p></li></ol><p>DOPO</p>')).toBe(true)
  // typing continues right after the pasted content
  await page.keyboard.type('!')
  expect(await html(page)).toContain('!')
})

test('Google Docs into a list item stays inside the list', async ({ page }) => {
  await page.keyboard.press('Control+Shift+8')
  await page.keyboard.type('voce')
  await paste(page, { 'text/html': GDOCS, 'text/plain': 'ignored' })
  const out = await html(page)
  // cursor at the end of the item's text: the pasted blocks follow it, inside the same item
  expect(out.startsWith('<ul><li><p>voce</p><h2>Titolo</h2>')).toBe(true)
  expect(out).toContain('<strong>Grassetto</strong>')
  expect(out).not.toMatch(/docs-internal|Arial|#000000/)
})

test('blocks pasted into an empty paragraph replace it', async ({ page }) => {
  await paste(page, {
    'text/html': '<h2>Titolo</h2><blockquote><p>citazione</p></blockquote>',
    'text/plain': '',
  })
  expect(await html(page)).toBe('<h2>Titolo</h2><blockquote><p>citazione</p></blockquote>')
})

test('Ctrl+Shift+V pastes plain text', async ({ page }) => {
  await page.keyboard.type('x')
  await page.evaluate(() => {
    document
      .querySelector('[role=textbox]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true }),
      )
  })
  await paste(page, { 'text/html': '<h1><b>Grassetto</b></h1>', 'text/plain': 'Grassetto' })
  expect(await html(page)).toBe('<p>xGrassetto</p>')
})

test('multi-line plain text becomes paragraphs', async ({ page }) => {
  await paste(page, { 'text/plain': 'uno\ndue\n\ntre' })
  expect(await html(page)).toBe('<p>uno</p><p>due</p><p></p><p>tre</p>')
})

test('a pasted <details> keeps title and content, never its handlers', async ({ page }) => {
  await editor(page).click()
  await paste(page, {
    'text/html':
      '<details open ontoggle="window.__xss=1"><summary onclick="window.__xss=2">Domanda</summary>Risposta</details>',
  })
  await expect
    .poll(() => html(page))
    .toContain('<details open=""><summary>Domanda</summary><p>Risposta</p></details>')
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
})
