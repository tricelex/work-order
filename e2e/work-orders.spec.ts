import { expect, test } from '@playwright/test';

test('technician creates, edits, sorts, filters and deletes work orders', async ({ page }) => {
  // empty state
  await page.goto('/');
  await expect(page.getByText('No work orders yet.')).toBeVisible();

  // server-side validation surfaces on the field and moves focus
  await page.getByRole('link', { name: 'New work order' }).first().click();
  const title = page.getByLabel('Title (required)');
  await title.fill('a');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByText('Title must be at least 2 characters')).toBeVisible();
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');

  // fix and submit from the keyboard
  await title.fill('Replace HVAC filter - Building B');
  await page.getByLabel(/^Description/).fill('Quarterly swap.\nUse MERV 13.');
  await page.getByLabel('Priority (required)').selectOption('High');
  await title.press('Enter');
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}\?notice=created$/);
  await expect(page.getByRole('status')).toHaveText('Work order created.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Replace HVAC filter - Building B');

  // edit
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Title (required)').fill('Replace HVAC filter - Building B (rush)');
  await page.getByLabel('Status (required)').selectOption('In Progress');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Work order updated.');

  // second order
  await page.goto('/work-orders/new');
  await page.getByLabel('Title (required)').fill('Inspect fire extinguishers');
  await page.getByLabel('Priority (required)').selectOption('Low');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByRole('status')).toHaveText('Work order created.');

  // list reflects both without a manual refresh; sort by priority
  await page.getByRole('link', { name: 'Work Orders', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: /priority/i }).click();
  await expect(page.getByRole('columnheader', { name: /priority/i })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('row').nth(1)).toContainText('Inspect fire extinguishers');

  // filter by status
  await page
    .getByRole('navigation', { name: 'Filter by status' })
    .getByRole('link', { name: 'In Progress' })
    .click();
  await expect(page).toHaveURL(/\?status=In%20Progress$/);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('row').nth(1)).toContainText('(rush)');

  // invalid or repeated status params fall back to the full list
  await page.goto('/?status=bogus');
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.goto('/?status=Open&status=Done');
  await expect(page.getByRole('row')).toHaveCount(3);

  // delete via the native dialog
  await page.getByRole('link', { name: /\(rush\)/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete work order' }).click();
  await expect(page).toHaveURL(/\/\?notice=deleted$/);
  await expect(page.getByRole('status')).toHaveText('Work order deleted.');
  await expect(page.getByText('(rush)')).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(2);
});

test('the list has no horizontal page scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('a long unbroken description does not overflow the detail page at 320px', async ({ page, request }) => {
  const created = await request.post('/api/work-orders', {
    data: { title: 'Long token', description: 'x'.repeat(1500), priority: 'Low' },
  });
  const { id } = (await created.json()) as { id: string };
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/work-orders/${id}`);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});
