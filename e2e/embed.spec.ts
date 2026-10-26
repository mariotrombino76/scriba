import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; setHTML(source: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

/** Synthetic paste (same code path as a real one). */
async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (t: string) => data[t] ?? '' },
    })
    document.querySelector('[role=textbox]')!.dispatchEvent(event)
  }, data)
}

const FIXED =
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" loading="lazy"'

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
  // the editor shows a card: no frame is loaded, so the strict CSP (no frame-src) is never hit
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('Inserisci ▸ Media from a YouTube link: a card in the editor, the player in the HTML', async ({
  page,
}) => {
  await setHTML(page, '<p></p>')
  await editor(page).click()
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await page
    .getByRole('menu', { name: 'Inserisci' })
    .getByRole('menuitem', { name: 'Media' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci media' })
  const address = dialog.getByRole('textbox', { name: 'Indirizzo o codice di incorporamento' })
  await expect(address).toBeFocused()
  // not a video address: refused, with a message
  await address.fill('https://evil.example/watch?v=dQw4w9WgXcQ')
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Indirizzo non riconosciuto: usa un link di YouTube, Vimeo, Dailymotion, Spotify o il codice di Google Maps',
  )
  await expect(address).toHaveAttribute('aria-invalid', 'true')
  await address.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')
  await dialog
    .getByRole('textbox', { name: 'Titolo (letto dai lettori di schermo)' })
    .fill('Il video')
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog).toHaveCount(0)

  await expect(editor(page).getByRole('img', { name: 'Video: Il video' })).toBeVisible()
  expect(await editor(page).locator('iframe').count()).toBe(0)
  await expect
    .poll(() => html(page))
    .toBe(
      `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="560" height="315" title="Il video" ${FIXED}></iframe><p></p>`,
    )
  // typing goes on below
  await page.keyboard.type('dopo')
  await expect.poll(() => html(page)).toMatch(/<\/iframe><p>dopo<\/p>$/)

  // double-click: change it
  await editor(page).getByRole('img', { name: 'Video: Il video' }).dblclick()
  const edit = page.getByRole('dialog', { name: 'Modifica media' })
  await expect(
    edit.getByRole('textbox', { name: 'Indirizzo o codice di incorporamento' }),
  ).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await edit
    .getByRole('textbox', { name: 'Indirizzo o codice di incorporamento' })
    .fill('https://vimeo.com/76979871')
  await edit.getByRole('spinbutton', { name: 'Larghezza (px)' }).fill('640')
  await edit.getByRole('spinbutton', { name: 'Altezza (px)' }).fill('360')
  await edit.getByRole('button', { name: 'Salva' }).click()
  await expect
    .poll(() => html(page))
    .toBe(
      `<iframe src="https://player.vimeo.com/video/76979871" width="640" height="360" title="Il video" ${FIXED}></iframe><p>dopo</p>`,
    )
})

test('pasted iframes: only the allowed players, rebuilt; anything else is dropped', async ({
  page,
}) => {
  // Chromium logs a CSP report as soon as an inert DOMParser document contains an on*
  // attribute, although nothing runs (see clipboard.spec); window.__xss proves it.
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  await paste(page, {
    'text/html':
      '<p>a</p><iframe src="https://evil.example/x" onload="window.__xss=1"></iframe>' +
      '<iframe srcdoc="<script>window.__xss=2</script>"></iframe>' +
      '<iframe src="https://player.vimeo.com/video/76979871" sandbox="allow-top-navigation" allow="camera" onload="window.__xss=3"></iframe><p>b</p>',
  })
  await expect
    .poll(() => html(page))
    .toBe(
      `<p>a</p><iframe src="https://player.vimeo.com/video/76979871" width="560" height="315" title="Vimeo" ${FIXED}></iframe><p>b</p>`,
    )
  expect(await editor(page).locator('iframe').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  // the same Chromium report, for the inert document (nothing ran: see __xss)
  await page.evaluate(() => {
    const list = (window as unknown as { scriba: Scriba }).scriba.cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})

async function openMedia(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu' })
    .getByRole('menuitem', { name: 'Inserisci' })
    .click()
  await page
    .getByRole('menu', { name: 'Inserisci' })
    .getByRole('menuitem', { name: 'Media' })
    .click()
  return page.getByRole('dialog', { name: 'Inserisci media' })
}

test('Media: the Google Maps embed code and a Spotify link', async ({ page }) => {
  await setHTML(page, '<p></p>')
  await editor(page).click()
  let dialog = await openMedia(page)
  const pb = '!1m18!1m12!1m3!1d2970.0!2d12.4922!3d41.8902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1'
  await dialog
    .getByRole('textbox', { name: 'Indirizzo o codice di incorporamento' })
    .fill(
      `<iframe src="https://www.google.com/maps/embed?pb=${pb}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>`,
    )
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(editor(page).getByRole('img', { name: 'Mappa: Google Maps' })).toBeVisible()
  await page.keyboard.type('x')
  dialog = await openMedia(page)
  await dialog
    .getByRole('textbox', { name: 'Indirizzo o codice di incorporamento' })
    .fill('https://open.spotify.com/intl-it/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(editor(page).getByRole('img', { name: 'Audio: Spotify' })).toBeVisible()
  await expect
    .poll(() => html(page))
    .toBe(
      `<iframe src="https://www.google.com/maps/embed?pb=${pb}" width="600" height="450" title="Google Maps" ${FIXED}></iframe>` +
        `<p>x</p><iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" width="560" height="152" title="Spotify" ${FIXED}></iframe><p></p>`,
    )
  expect(await editor(page).locator('iframe').count()).toBe(0)
})

test('Media: uploading an audio file gives a real player in the editor', async ({ page }) => {
  await setHTML(page, '<p></p>')
  await editor(page).click()
  const dialog = await openMedia(page)
  // a file of an unsupported type is refused with a message
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Carica un file audio o video' }).click()
  await (
    await chooser
  ).setFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(dialog.getByRole('alert')).toHaveText(/Formato non supportato/)
  const again = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Carica un file audio o video' }).click()
  await (
    await again
  ).setFiles({
    name: 'registrazione.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFF'),
  })
  await expect(dialog).toHaveCount(0)
  const audio = editor(page).locator('audio')
  await expect(audio).toHaveAttribute('controls', '')
  await expect
    .poll(() => html(page))
    .toMatch(/^<audio src="\/[^"]+\.wav" controls><\/audio><p><\/p>$/)
  // the player is usable inside the editor (its events are left to the browser)
  await audio.evaluate((el: HTMLAudioElement) => el.play().catch(() => {}))
})

test('pasted <video>: autoplay, poster and handlers are dropped; http is refused', async ({
  page,
}) => {
  const errors = (page as unknown as { errors: string[] }).errors
  page.on('console', () => {
    for (let i = errors.length - 1; i >= 0; i--)
      if (/^Executing inline event handler violates/.test(errors[i]!)) errors.splice(i, 1)
  })
  await paste(page, {
    'text/html':
      '<p>a</p><video src="http://cdn.example/a.mp4" autoplay></video>' +
      '<video autoplay muted loop poster="javascript:alert(1)" onplay="window.__xss=1"><source src="data:video/mp4;base64,AA"></video><p>b</p>',
  })
  await expect.poll(() => html(page)).toBe('<p>a</p><p>b</p>')
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await page.evaluate(() => {
    const list = (window as unknown as { scriba: Scriba }).scriba.cspViolations
    for (let i = list.length - 1; i >= 0; i--)
      if (list[i] === 'script-src-attr: inline') list.splice(i, 1)
  })
})
