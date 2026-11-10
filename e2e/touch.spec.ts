import { expect, test, type Page } from '@playwright/test'

/**
 * Touch screens (phone size, finger). Firefox has no touch emulation in
 * Playwright; finger drags go through the Chrome DevTools protocol (Chromium).
 */
test.skip(({ browserName }) => browserName === 'firefox', 'no touch emulation')
test.use({ hasTouch: true, viewport: { width: 412, height: 860 } })

type Scriba = { html(): string; setHTML(s: string): void; cspViolations: string[] }
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

// a 4x4 red PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC'

/** A finger drag from one point to another (Chromium only). */
async function fingerDrag(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page)
  const point = ([x, y]: [number, number]) => [{ x, y, id: 1, radiusX: 4, radiusY: 4 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) })
  for (let i = 1; i <= 5; i++) {
    const at: [number, number] = [
      from[0] + ((to[0] - from[0]) * i) / 5,
      from[1] + ((to[1] - from[1]) * i) / 5,
    ]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(at) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await expect(editor(page)).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('phone size: nothing wider than the screen; a tap outside closes a menu', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412)
  const menubar = page.getByRole('menubar', { name: 'Menu' })
  await menubar.getByRole('menuitem', { name: 'Inserisci' }).tap()
  const menu = page.getByRole('menu', { name: 'Inserisci' })
  await expect(menu).toBeVisible()
  await page.touchscreen.tap(200, 840)
  await expect(menu).toBeHidden()
})

test('the bubble goes below a selection made after a touch', async ({ page }) => {
  await setHTML(page, '<p>Ciao mondo bello</p>')
  await editor(page).getByText('Ciao mondo bello').tap()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  const bubble = page.getByRole('toolbar', { name: 'Formattazione della selezione' })
  await expect(bubble).toBeVisible()
  const text = (await editor(page).locator('p').boundingBox())!
  const bar = (await bubble.boundingBox())!
  expect(bar.y).toBeGreaterThan(text.y + text.height)
})

test('finger: image corner handle resizes the image', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'finger drags need the DevTools protocol')
  await setHTML(page, `<p>prima <img src="${PNG}" alt="Punto" width="120"> dopo</p>`)
  await editor(page).locator('img').tap()
  const handle = page.locator('.scriba-resize-e')
  await expect(handle).toBeVisible()
  const box = (await handle.boundingBox())!
  // big enough for a finger
  expect(box.width).toBeGreaterThanOrEqual(24)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await fingerDrag(page, [x, y], [x + 60, y])
  await expect.poll(() => html(page)).toMatch(/width="1[78]\d"/)
})

test('finger: dragging a cell border resizes the column, the page does not scroll', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'finger drags need the DevTools protocol')
  await setHTML(
    page,
    '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>',
  )
  const cell = editor(page).locator('td').first()
  const box = (await cell.boundingBox())!
  // the finger lands just past the border, in the next cell
  const x = box.x + box.width + 6
  const y = box.y + box.height / 2
  const scroll = await page.evaluate(() => scrollY)
  await fingerDrag(page, [x, y], [x + 50, y])
  await expect.poll(() => html(page)).toMatch(/<td width="\d+"><p>a<\/p><\/td>/)
  const set = Number(/<td width="(\d+)"><p>a/.exec(await html(page))![1])
  expect(Math.abs(set - Math.round(box.width + 44))).toBeLessThanOrEqual(8)
  expect(await page.evaluate(() => scrollY)).toBe(scroll)
})
