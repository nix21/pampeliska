import { expect, test } from '@playwright/test'
import { resetAndLogin } from './helpers'

test('průvodce prvním spuštěním založí domácnost, účty a kategorie', async ({ page }) => {
  await resetAndLogin(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Založ domácnost' })).toBeVisible()
  await page.getByRole('textbox').first().fill('Domácnost E2E')
  await page.getByRole('button', { name: 'Přidat člena' }).click()
  await page.getByPlaceholder('Jméno').nth(1).fill('Míša')
  await page.getByPlaceholder('e-mail pro přihlášení Googlem').fill('misa-e2e@example.com')
  await page.getByRole('button', { name: 'Pokračovat' }).click()

  await expect(page.getByRole('heading', { name: 'Přidej účty' })).toBeVisible()
  await page.getByRole('button', { name: 'Fio banka' }).click()
  await page.getByRole('button', { name: 'Česká spořitelna' }).click()
  await page.getByRole('button', { name: 'Pokračovat' }).click()

  await expect(page.getByRole('heading', { name: 'Vyber výchozí strom kategorií' })).toBeVisible()
  await expect(page.getByText('Bydlení')).toBeVisible()
  await page.getByRole('button', { name: 'Pokračovat' }).click()

  await expect(page.getByRole('heading', { name: 'Jak dostaneš první pohyby?' })).toBeVisible()
  await page.getByRole('button', { name: 'Dokončit' }).click()

  await expect(page.getByText('Domácnost E2E').first()).toBeVisible()
  await page.goto('/ucty')
  await expect(page.getByText('Fio banka').first()).toBeVisible()
  await page.goto('/kategorie')
  await expect(page.getByText('Supermarkety').first()).toBeVisible()
})
