import { expect, test, type Page } from '@playwright/test'

// 1×1 PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const png = { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') }

const html = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriba: { html(): string } }).scriba.html())
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })

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
    await page.evaluate(
      () => (window as unknown as { scriba: { cspViolations: string[] } }).scriba.cspViolations,
    ),
  ).toEqual([])
})

async function insertWithPicker(
  page: Page,
  options: { alt?: string; width?: string; align?: string } = {},
) {
  await toolbar(page).getByRole('button', { name: 'Immagine', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci immagine' })
  await expect(dialog).toBeVisible()
  // the file picker button is focused first
  await expect(dialog.getByRole('button', { name: 'Scegli un file…' })).toBeFocused()
  await dialog.locator('input[type=file]').setInputFiles(png)
  await expect(dialog.getByText('foto.png')).toBeVisible()
  if (options.alt !== undefined)
    await dialog.getByLabel('Testo alternativo', { exact: true }).fill(options.alt)
  if (options.width) await dialog.getByLabel('Larghezza in pixel').fill(options.width)
  if (options.align) await dialog.getByLabel(options.align).check()
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  return dialog
}

test('file picker: upload, alt text, width and alignment', async ({ page }) => {
  await page.keyboard.type('prima ')
  const dialog = await insertWithPicker(page, {
    alt: 'Una foto',
    width: '200',
    align: 'A sinistra (testo intorno)',
  })
  await expect(dialog).toBeHidden()
  expect(await html(page)).toBe(
    `<p>prima <img src="data:image/png;base64,${PNG_B64}" alt="Una foto" width="200" style="float: left"></p>`,
  )
  await expect(editor(page).locator('img')).toHaveCSS('float', 'left')
  await expect(page.getByRole('status')).toHaveText('Immagine inserita')
})

test('alternative text is required unless the image is decorative', async ({ page }) => {
  const dialog = await insertWithPicker(page)
  await expect(dialog.getByText('Scrivi un testo alternativo')).toBeVisible()
  await expect(dialog.getByLabel('Testo alternativo', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await dialog.getByLabel('Immagine decorativa (nessun testo alternativo)').check()
  await dialog.getByRole('button', { name: 'Inserisci' }).click()
  await expect(dialog).toBeHidden()
  expect(await html(page)).toContain('alt=""')
})

test('the picker refuses files of the wrong type', async ({ page }) => {
  await toolbar(page).getByRole('button', { name: 'Immagine', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Inserisci immagine' })
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(dialog.getByText('Formato non ammesso')).toBeVisible()
  await expect(dialog.getByText('Nessun file scelto')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor(page)).toBeFocused()
})

test('drop an image file into the editor', async ({ page }) => {
  await page.keyboard.type('testo')
  const box = (await editor(page).locator('p').boundingBox())!
  await page.evaluate(
    ({ b64, x, y }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], 'drop.png', { type: 'image/png' }))
      const target = document.querySelector('[role=textbox] p')!
      target.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { b64: PNG_B64, x: box.x + box.width - 2, y: box.y + box.height / 2 },
  )
  await expect.poll(() => html(page)).toContain('<img src="data:image/png;base64,')
})

test('click selects, Enter edits, resize handle changes the width, Backspace deletes', async ({
  page,
}) => {
  await insertWithPicker(page, { alt: 'Foto', width: '200' })
  const img = editor(page).locator('img')
  await page.keyboard.press('ArrowRight') // leave the node selection
  await img.click()
  await expect(img).toHaveClass(/scriba-selected-node/)
  await expect(
    toolbar(page).getByRole('button', { name: 'Immagine', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Enter opens the edit dialog, prefilled
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Modifica immagine' })
  await expect(dialog.getByLabel('Testo alternativo', { exact: true })).toHaveValue('Foto')
  await dialog.getByLabel('Larghezza in pixel').fill('120')
  await dialog.getByLabel('Al centro').check()
  await dialog.getByRole('button', { name: 'Salva' }).click()
  expect(await html(page)).toContain(
    'alt="Foto" width="120" style="display: block; margin-left: auto; margin-right: auto"',
  )

  // resize with the east handle
  const handle = page.locator('.scriba-resize-e')
  await expect(handle).toBeVisible()
  const h = (await handle.boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect
    .poll(async () => Number((await html(page)).match(/width="(\d+)"/)?.[1]))
    .toBeGreaterThan(160)

  // Backspace deletes the selected image
  await img.click()
  await page.keyboard.press('Backspace')
  expect(await html(page)).not.toContain('<img')
})
