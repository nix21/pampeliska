import { expect, test } from '@playwright/test'
import { seedDemo } from './helpers'

test('poznámky pro AI: přidání, úprava a smazání v Pravidlech', async ({ page }) => {
  await seedDemo(page)
  await page.goto('/pravidla')
  await page.getByRole('radio', { name: 'Poznámky pro AI' }).click()
  await expect(page).toHaveURL(/tab=notes/)
  await expect(page.getByText('Zatím žádné poznámky')).toBeVisible()

  await page.getByRole('button', { name: 'Nová poznámka' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('Platby od Jany K. jsou kapesné pro dceru.')
  await dialog.getByPlaceholder('Např. Alza').fill('Jana K')
  await dialog.getByRole('button', { name: 'Přidat poznámku' }).click()
  await expect(page.getByText('Platby od Jany K. jsou kapesné pro dceru.')).toBeVisible()
  await expect(page.getByText('Jana K', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Upravit poznámku' }).click()
  await dialog.getByRole('textbox').first().fill('Jana K. = kapesné')
  await dialog.getByRole('button', { name: 'Uložit' }).click()
  await expect(page.getByText('Jana K. = kapesné')).toBeVisible()

  await page.getByRole('button', { name: 'Smazat poznámku' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Smazat' }).click()
  await expect(page.getByText('Zatím žádné poznámky')).toBeVisible()
})
