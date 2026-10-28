import { expect, test, type Page } from '@playwright/test'

type Scriba = { html(): string; saved: string[]; cspViolations: string[] }
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor di prova' })
const saveEntry = async (page: Page) => {
  await page.getByRole('menubar', { name: 'Menu' }).getByRole('menuitem', { name: 'File' }).click()
  return page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: /^Salva/ })
}

test('File ▸ Salva: enabled after a change, saves, then disabled again', async ({ page }) => {
  await page.goto('/')
  await editor(page).click()
  await expect(await saveEntry(page)).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await editor(page).click()
  await page.keyboard.type('nuovo testo')
  const entry = await saveEntry(page)
  await expect(entry).toHaveAttribute('aria-disabled', 'false')
  await entry.click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { scriba: Scriba }).scriba.saved.length))
    .toBe(1)
  await expect(await saveEntry(page)).toHaveAttribute('aria-disabled', 'true')
})
