import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Add Key Value to File System', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(process.env.SN_URL);

  // Open CI Class Manager
  await page.getByRole('menuitem', { name: 'All' }).click();

  await page
    .getByRole('textbox', { name: 'Enter search term to filter' })
    .fill('ci class');

  await page.getByRole('link', { name: 'CI Class Manager 1 of' }).click();

  const frame = page.locator('iframe[name="gsft_main"]').contentFrame();

  await frame.getByRole('button', { name: 'Toggle hierarchy' }).click();

  await frame
    .getByRole('searchbox', { name: 'Search CI Classes' })
    .fill('storage file');

  await frame.getByRole('option', { name: 'Storage File Share', exact: true }).click();

  // "Contains N CIs" count varies — matching just the class name prefix,
  // not the exact count
  await frame
    .getByRole('button', { name: /^Storage File Share, Contains/ })
    .click();

  await frame
    .getByRole('button', { name: 'Show information for Class Info - Identification Rule' })
    .click();

  await frame.getByRole('button', { name: 'Add related entry' }).click();

  // Confirmed fix: the panel needs a moment to finish rendering before its
  // dropdown is actually interactive
  await page.waitForTimeout(2_000);

  await frame.locator('a').filter({ hasText: 'Affected CIs' }).click();

  const select2Search = frame.locator('.select2-drop-active input.select2-input');
  await select2Search.waitFor({ state: 'visible', timeout: 60_000 });
  await select2Search.fill('key');

  await frame.getByRole('option', { name: 'Key Value' }).waitFor({ state: 'visible', timeout: 30_000 });
  await frame.getByRole('option', { name: 'Key Value' }).click();

  const availableList = frame.getByLabel('Available', { exact: true });
  await availableList.selectOption([{ label: 'Key' }, { label: 'Value' }]);

  await frame.getByRole('button', { name: /Add selected items to the/ }).click();

  await frame.getByRole('button', { name: 'Save' }).click();
});