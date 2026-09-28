import { expect, test } from '@playwright/test'
import { seedDemo } from './helpers'

interface Cat { id: number; name: string }

test.beforeEach(async ({ page }) => seedDemo(page))

test('fronta: potvrzení návrhu ubere položku z fronty', async ({ page }) => {
  await page.goto('/trideni')
  await expect(page.getByRole('heading', { name: 'Ke kategorizaci' })).toBeVisible()
  const before = await page.request.get('/api/inbox').then((r) => r.json())
  expect(before.counts.all).toBeGreaterThan(0)
  await page.getByRole('button', { name: /Potvrdit a další/ }).first().click()
  await expect.poll(async () => (await page.request.get('/api/inbox').then((r) => r.json())).counts.all).toBeLessThan(before.counts.all)
})

test('kategorie: nová podkategorie a sloučení se projeví ve stromu', async ({ page }) => {
  const tree: Cat[] = await page.request.get('/api/categories').then((r) => r.json())
  const food = tree.find((c) => c.name === 'Jídlo')!
  const created = await page.request.post('/api/categories', { data: { name: 'Pekárny E2E', parentId: food.id } }).then((r) => r.json())
  await page.goto('/kategorie')
  await expect(page.getByText('Pekárny E2E').first()).toBeVisible()
  const target = tree.find((c) => c.name === 'Supermarkety')!
  const merged = await page.request.post(`/api/categories/${created.id}/merge`, { data: { targetId: target.id } })
  expect(merged.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByText('Pekárny E2E')).toHaveCount(0)
})

test('pravidla: seznam a test na historii', async ({ page }) => {
  await page.goto('/pravidla')
  await expect(page.getByRole('heading', { name: 'Pravidla', exact: true })).toBeVisible()
  await expect(page.getByText(/ALBERT/).first()).toBeVisible()
  const cats: Cat[] = await page.request.get('/api/categories').then((r) => r.json())
  const res = await page.request.post('/api/rules/test', {
    data: { draft: { conditions: [{ field: 'Merchant', op: 'Contains', value: 'benzina' }], logic: 'And', categoryId: cats.find((c) => c.name === 'Palivo')!.id } },
  }).then((r) => r.json())
  expect(res.matches).toBeGreaterThan(0)
})

test('všechny obrazovky se načtou bez chyby', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const screens: [string, string][] = [
    ['/', 'Přehled'], ['/ucty', 'Účty'], ['/pohyby', 'Pohyby'], ['/vydaje', 'Výdaje'], ['/trideni', 'Ke kategorizaci'], ['/davky', 'Dávky'],
    ['/kategorie', 'Kategorie'], ['/pravidla', 'Pravidla'], ['/pravidelne', 'Pravidelné platby a výhled'], ['/rozpocty', 'Rozpočty'],
    ['/usetrit', 'Kde ušetřit'], ['/investice', 'Investice a jmění'], ['/clenove', 'Členové'], ['/nastaveni', 'Nastavení'],
  ]
  for (const [path, heading] of screens) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})
