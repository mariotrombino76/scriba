import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor inline' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formattazione', exact: true })

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  ;(page as unknown as { errors: string[] }).errors = errors
  await page.goto('/inline.html')
  await expect(editor(page)).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([])
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { scribaInline: { cspViolations: string[] } }).scribaInline
          .cspViolations,
    ),
  ).toEqual([])
})

test('the text takes the page styles; the toolbar shows only with the focus', async ({ page }) => {
  const style = await editor(page).evaluate((el) => {
    const s = getComputedStyle(el)
    return { font: s.fontFamily, size: s.fontSize, color: s.color, padding: s.paddingLeft }
  })
  expect(style).toEqual({
    font: 'Georgia, serif',
    size: '20px',
    color: 'rgb(40, 20, 90)',
    padding: '0px',
  })
  await expect(toolbar(page)).toBeHidden()

  await editor(page).click()
  await expect(toolbar(page)).toBeVisible()
  // floating above the text, as wide as it
  const bar = (await toolbar(page).boundingBox())!
  const area = (await editor(page).boundingBox())!
  expect(bar.y + bar.height).toBeLessThanOrEqual(area.y + 1)
  expect(Math.round(bar.width)).toBe(Math.round(area.width))

  // using it keeps it there
  await page.keyboard.press('ControlOrMeta+a')
  await toolbar(page).getByRole('button', { name: 'Corsivo' }).click()
  await expect(toolbar(page)).toBeVisible()
  await expect(editor(page).locator('em').first()).toBeVisible()

  // leaving the editor hides it
  await page.getByRole('button', { name: 'Prima' }).focus()
  await expect(toolbar(page)).toBeHidden()
})

test('keyboard: Tab shows the toolbar, Alt+F10 enters it, Escape goes back', async ({ page }) => {
  // Tab from the page lands in the text (the hidden toolbar is skipped) and shows the toolbar
  await page.getByRole('button', { name: 'Prima' }).focus()
  await page.keyboard.press('Tab')
  await expect(editor(page)).toBeFocused()
  await expect(toolbar(page)).toBeVisible()
  await page.keyboard.press('Alt+F10')
  const focused = toolbar(page).locator(':focus')
  await expect(focused).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(editor(page)).toBeFocused()
  await expect(toolbar(page)).toBeVisible()
})

test('docked at the top of the window when the text scrolled up', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 400 })
  await editor(page).evaluate((el) => {
    // a long text, taller than the window
    el.ownerDocument.defaultView!.scrollTo(0, 0)
  })
  await page.evaluate(() =>
    (
      window as unknown as { scribaInline: { editor: { setContent(c: string): void } } }
    ).scribaInline.editor.setContent(
      Array.from({ length: 40 }, (_, i) => `<p>Riga ${i + 1}</p>`).join(''),
    ),
  )
  await editor(page).getByText('Riga 30', { exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect(toolbar(page)).toHaveAttribute('data-placement', 'docked')
  await expect.poll(async () => (await toolbar(page).boundingBox())!.y).toBe(0)
})
