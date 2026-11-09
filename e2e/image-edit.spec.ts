import { expect, test, type Page } from '@playwright/test'

type Scriba = {
  html(): string
  setHTML(source: string): void
  cspViolations: string[]
}
const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.html())
const setHTML = (page: Page, source: string) =>
  page.evaluate((s) => (window as unknown as { scriba: Scriba }).scriba.setHTML(s), source)
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const contextMenu = (page: Page) => page.getByRole('menu', { name: 'Menu contestuale' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Modifica foto' })

/** A 40×20 PNG: the left half red, the right half blue. */
const makePhoto = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 20
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 20, 20)
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(20, 0, 20, 20)
    return canvas.toDataURL('image/png')
  })

/** Size and some pixels ([r, g, b]) of the image now in the document. */
const photo = (page: Page, points: [number, number][]) =>
  page.evaluate(async (points) => {
    const img = document.querySelector<HTMLImageElement>('.scriba-editor img, [role=textbox] img')!
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      pixels: points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]),
    }
  }, points)

async function openEditor(page: Page) {
  await editor(page).getByRole('img', { name: 'bandiera' }).click({ button: 'right' })
  await contextMenu(page).getByRole('menuitem', { name: 'Modifica foto…' }).click()
  const d = dialog(page)
  await expect(d).toBeVisible()
  await expect(d.getByText('Risultato: 40 × 20 px')).toBeVisible()
  return d
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/')
  await editor(page).click()
  await setHTML(page, `<p>x <img src="${await makePhoto(page)}" alt="bandiera" width="80"></p>`)
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.cspViolations),
  ).toEqual([])
})

test('rotate and crop from the keyboard; the displayed scale stays; undo restores', async ({
  page,
}) => {
  const before = await html(page)
  const d = await openEditor(page)
  // the first tool has the focus once the photo is loaded
  await expect(d.getByRole('button', { name: 'Ruota a sinistra' })).toBeFocused()
  await d.getByRole('button', { name: 'Ruota a destra' }).click()
  await expect(d.getByText('Risultato: 20 × 40 px')).toBeVisible()
  // the red half (left) is now on top: keep it
  await d.getByLabel('Altezza (px)').fill('20')
  await d.getByLabel('Altezza (px)').press('Tab')
  await expect(d.getByText('Risultato: 20 × 20 px')).toBeVisible()
  await d.getByRole('button', { name: 'Salva' }).click()
  await expect(d).toBeHidden()
  await expect(editor(page)).toBeFocused()

  await expect
    .poll(() => html(page))
    .toMatch(/^<p>x <img src="data:image\/png;base64,[^"]+" alt="bandiera" width="40"><\/p>$/)
  expect(
    await photo(page, [
      [0, 0],
      [19, 19],
    ]),
  ).toEqual({
    width: 20,
    height: 20,
    pixels: [
      [255, 0, 0],
      [255, 0, 0],
    ],
  })
  // the image stays selected; one undo brings the original back
  await page.keyboard.press('Control+z')
  await expect.poll(() => html(page)).toBe(before)
})

test('flip, a fixed ratio and the crop handles', async ({ page }) => {
  const d = await openEditor(page)
  await d.getByRole('button', { name: 'Rifletti in orizzontale' }).click()
  await d.getByLabel('Quadrato').check()
  await expect(d.getByText('Risultato: 20 × 20 px')).toBeVisible()
  // centred square: x = 10
  await expect(d.getByLabel('Da sinistra (px)')).toHaveValue('10')
  // drag the square to the left edge with the mouse
  const box = d.locator('.scriba-crop-box')
  const b = (await box.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x - 400, b.y + b.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(d.getByLabel('Da sinistra (px)')).toHaveValue('0')
  // a corner handle keeps the square
  const nw = (await d.locator('.scriba-crop-se').boundingBox())!
  await page.mouse.move(nw.x + nw.width / 2, nw.y + nw.height / 2)
  await page.mouse.down()
  await page.mouse.move(nw.x - 60, nw.y - 60, { steps: 4 })
  await page.mouse.up()
  const w = Number(await d.getByLabel('Larghezza (px)').inputValue())
  expect(w).toBeLessThan(20)
  await expect(d.getByLabel('Altezza (px)')).toHaveValue(String(w))
  await d.getByRole('button', { name: 'Salva' }).click()
  await expect(d).toBeHidden()
  // mirrored: blue is now on the left, and the crop starts there
  const result = await photo(page, [[0, 0]])
  expect(result.width).toBe(w)
  expect(result.height).toBe(w)
  expect(result.pixels).toEqual([[0, 0, 255]])
})

test('brightness, saturation, reset', async ({ page }) => {
  const d = await openEditor(page)
  const saturation = d.getByLabel('Saturazione')
  await saturation.focus()
  // Home = the minimum: no colour left
  await page.keyboard.press('Home')
  await expect(d.locator('output').nth(2)).toHaveText('-100')
  await d.getByRole('button', { name: 'Ripristina' }).click()
  await expect(d.locator('output').nth(2)).toHaveText('0')
  await saturation.focus()
  await page.keyboard.press('Home')
  await d.getByRole('button', { name: 'Salva' }).click()
  await expect(d).toBeHidden()
  const grey = await photo(page, [
    [0, 0],
    [39, 0],
  ])
  for (const [r, g, b] of grey.pixels) {
    expect(r).toBe(g)
    expect(g).toBe(b)
  }
  expect(grey.width).toBe(40)
})

test('nothing changed: Save only closes; Escape cancels', async ({ page }) => {
  const before = await html(page)
  let d = await openEditor(page)
  await d.getByRole('button', { name: 'Salva' }).click()
  await expect(d).toBeHidden()
  expect(await html(page)).toBe(before)
  d = await openEditor(page)
  await d.getByRole('button', { name: 'Ruota a destra' }).click()
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
  expect(await html(page)).toBe(before)
})

test('an image that cannot be read says so', async ({ page }) => {
  await setHTML(page, '<p>x <img src="/manca.png" alt="bandiera" width="80"></p>')
  // the broken image still has its box to click on
  await editor(page).getByRole('img', { name: 'bandiera' }).click({ button: 'right', force: true })
  await contextMenu(page).getByRole('menuitem', { name: 'Modifica foto…' }).click()
  const d = dialog(page)
  await expect(d.getByText('Impossibile aprire la foto')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Salva' })).toBeDisabled()
  await expect(d.getByRole('button', { name: 'Annulla' })).toBeFocused()
  // the missing file is an expected 404 here
  ;(page as unknown as { errors: string[] }).errors.length = 0
})
