import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    scriba: {
      html(): string
      selection(): { from: number; to: number }
      cspViolations: string[]
    }
  }
}

const html = (page: Page) => page.evaluate(() => window.scriba.html())
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const mod = (browserName: string) =>
  (process.platform === 'darwin' ? 'Meta' : 'Control') + (browserName ? '' : '')

const consoleErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  consoleErrors.set(page, errors)
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await editor(page).click()
})

test.afterEach(async ({ page }) => {
  // The editor must work under a strict CSP with Trusted Types (CLAUDE.md §5.7).
  expect(await page.evaluate(() => window.scriba.cspViolations)).toEqual([])
  expect(consoleErrors.get(page)).toEqual([])
})

test('is an accessible multiline textbox', async ({ page }) => {
  const box = editor(page)
  await expect(box).toHaveAttribute('aria-multiline', 'true')
  await expect(box).toHaveAttribute('contenteditable', 'true')
})

test('typing, Enter and Backspace go through the model', async ({ page }) => {
  await page.keyboard.type('Ciao mondo')
  await page.keyboard.press('Enter')
  await page.keyboard.type('riga due')
  expect(await html(page)).toBe('<p>Ciao mondo</p><p>riga due</p>')
  for (let i = 0; i < 'riga due'.length + 1; i++) await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p>Ciao mondo</p>')
  await page.keyboard.type('!')
  expect(await html(page)).toBe('<p>Ciao mondo!</p>')
})

test('keeps multiple spaces', async ({ page }) => {
  await page.keyboard.type('a  b')
  expect(await html(page)).toBe('<p>a  b</p>')
})

test('Ctrl+B / Ctrl+I toggle marks for the next typed text', async ({ page, browserName }) => {
  const m = mod(browserName)
  await page.keyboard.type('a')
  await page.keyboard.press(`${m}+b`)
  await page.keyboard.type('b')
  await page.keyboard.press(`${m}+i`)
  await page.keyboard.type('c')
  await page.keyboard.press(`${m}+b`)
  await page.keyboard.press(`${m}+i`)
  await page.keyboard.type('d')
  expect(await html(page)).toBe('<p>a<strong>b<em>c</em></strong>d</p>')
})

test('bold on a selection, then undo and redo', async ({ page, browserName }) => {
  const m = mod(browserName)
  await page.keyboard.type('abc')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect
    .poll(() => page.evaluate(() => window.scriba.selection()))
    .toEqual({ from: 2, to: 4 })
  await page.keyboard.press(`${m}+b`)
  expect(await html(page)).toBe('<p>a<strong>bc</strong></p>')
  await page.keyboard.press(`${m}+z`)
  expect(await html(page)).toBe('<p>abc</p>')
  await page.keyboard.press(`${m}+y`)
  expect(await html(page)).toBe('<p>a<strong>bc</strong></p>')
})

test('headings with Ctrl+Alt+1 and Enter at the end creates a paragraph', async ({
  page,
  browserName,
}) => {
  const m = mod(browserName)
  await page.keyboard.type('Titolo')
  await page.keyboard.press(`${m}+Alt+1`)
  await page.keyboard.press('Enter')
  await page.keyboard.type('testo')
  expect(await html(page)).toBe('<h1>Titolo</h1><p>testo</p>')
})

test('Shift+Enter inserts a hard break', async ({ page }) => {
  await page.keyboard.type('a')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('b')
  expect(await html(page)).toBe('<p>a<br>b</p>')
})

test('arrow keys and clicks move the model selection', async ({ page }) => {
  await page.keyboard.type('abcd')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect
    .poll(() => page.evaluate(() => window.scriba.selection()))
    .toEqual({ from: 3, to: 3 })
  await page.keyboard.type('X')
  expect(await html(page)).toBe('<p>abXcd</p>')
})

test('select all and delete leaves an empty paragraph', async ({ page, browserName }) => {
  await page.keyboard.type('uno')
  await page.keyboard.press('Enter')
  await page.keyboard.type('due')
  await page.keyboard.press(`${mod(browserName)}+a`)
  await page.keyboard.press('Backspace')
  expect(await html(page)).toBe('<p></p>')
  await page.keyboard.type('x')
  expect(await html(page)).toBe('<p>x</p>')
})

test('paste is sanitized through the schema', async ({ page }) => {
  await page.keyboard.type('x')
  await page.evaluate(() => {
    // Synthetic clipboard (Firefox drops data of synthetic ClipboardEvents): same code path.
    const data: Record<string, string> = {
      'text/html': '<img src=x onerror="window.pwned=1"><b>bold</b><script>window.pwned=1</script>',
      'text/plain': 'bold',
    }
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  })
  expect(await html(page)).toBe('<p>x<strong>bold</strong></p>')
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  // Chromium reports (and blocks) inline handlers met while parsing the pasted HTML in the
  // inert document: proof the CSP is enforced there too. Only those reports are expected here.
  const violations = await page.evaluate(() => window.scriba.cspViolations.splice(0))
  expect(violations.every((v) => v.startsWith('script-src-attr'))).toBe(true)
  const errors = consoleErrors.get(page)!
  const unexpected = errors.filter((e) => !/inline event handler|script-src-attr/i.test(e))
  errors.length = 0
  expect(unexpected).toEqual([])
})

test('IME composition (Chromium CDP)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'IME simulation uses the Chrome DevTools Protocol')
  await page.keyboard.type('a')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 })
  await cdp.send('Input.imeSetComposition', { text: 'かん', selectionStart: 2, selectionEnd: 2 })
  await cdp.send('Input.insertText', { text: '漢' })
  await expect.poll(() => html(page)).toBe('<p>a漢</p>')
  await page.keyboard.type('b')
  await expect.poll(() => html(page)).toBe('<p>a漢b</p>')
})
