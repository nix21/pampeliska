import { expect, test } from '@playwright/test'
import { seedDemo } from './helpers'

test('mobil: spodní navigace, obrazovka Více a žádný vodorovný posuv', async ({ page }) => {
  await seedDemo(page)
  for (const path of ['/', '/pohyby', '/trideni', '/rozpocty', '/kategorie', '/ucty']) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Navigace' })).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, path).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
  await page.getByRole('navigation', { name: 'Navigace' }).getByRole('link', { name: 'Více' }).click()
  await expect(page.getByRole('heading', { name: 'Více' })).toBeVisible()
  await page.getByRole('link', { name: 'Pravidla' }).click()
  await expect(page.getByRole('heading', { name: 'Pravidla', exact: true })).toBeVisible()
})
