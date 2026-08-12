import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Add Key Value to Affected CIs', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(process.env.SN_URL);

  // Open CI Class Manager
  await page.getByRole('menuitem', { name: 'All' }).click();

  await page
    .getByRole('textbox', { name: 'Enter search term to filter' })
    .fill('ci class');

  await page.getByRole('link', { name: /CI Class Manager/i }).click();

  const frame = page.locator('iframe[name="gsft_main"]').contentFrame();

  // Expand hierarchy only once
  await frame.getByRole('button', { name: 'Toggle hierarchy' }).click();

  // Search for AWS S3 class
  await frame
    .getByRole('searchbox', { name: 'Search CI Classes' })
    .fill('aws s3');

  await frame.getByRole('option', { name: /AWS S3 Endpoint/i }).click();

  // Open AWS S3 Endpoint class
  await frame
    .getByRole('button', {
      name: /AWS S3 Endpoint/i,
    })
    .click();

  // Open Identification Rule section
  await frame
    .getByRole('button', {
      name: /Show information for Class Info - Identification Rule/i,
    })
    .click();

  // Add related entry
  await frame.getByRole('button', { name: /Add related entry/i }).click();

  // Select Affected CIs
  await frame.locator('a').filter({ hasText: 'Affected CIs' }).click();

  // Wait for Select2 field to appear
  const select2Search = frame.locator('input.select2-input').first();

  await select2Search.waitFor({ state: 'visible' });
  await select2Search.click();

  // Type search text
  await select2Search.pressSequentially('key');

  // Wait for dropdown results
  await frame.locator('.select2-result-label').waitFor();

  // Click Key Value
  await frame
    .locator('.select2-result-label', {
      hasText: 'Key Value',
    })
    .click();

  // Select available attributes
  const availableList = frame.getByLabel('Available', { exact: true });

  await availableList.selectOption([
    'object:6727',
    'object:6730',
  ]);

  // Move selected items
  await frame
    .getByRole('button', {
      name: /Add selected items to the/i,
    })
    .click();

  // Save
  await frame.getByRole('button', { name: 'Save' }).click();
});