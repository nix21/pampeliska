import { expect, type Page } from '@playwright/test'

/** Přihlášení přes DevBypass a vyčištění domácnosti (průvodce začne znovu). */
export async function resetAndLogin(page: Page) {
  await page.goto('/auth/login')
  const res = await page.request.post('/testing/reset', { data: {} })
  expect(res.status()).toBe(204)
}

/** Ukázková domácnost (dva členové, 7 účtů, půl roku pohybů, pravidla, rozpočty…). */
export async function seedDemo(page: Page) {
  await resetAndLogin(page)
  const res = await page.request.post('/testing/demo', { data: {} })
  expect(res.status(), await res.text()).toBe(204)
}
