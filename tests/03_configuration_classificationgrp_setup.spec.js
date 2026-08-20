import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-005: Save valid Configuration Form (Classification Group)', async ({ page }) => {
  test.setTimeout(120_000);

  // --- Navigate to Guided Setup ---
  await page.goto(process.env.SN_URL);
  await page.getByRole('menuitem', { name: 'All' }).click();
  await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
  await page.getByRole('link', { name: 'Setup 1 of' }).click();

  const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
  await guidedSetupFrame
    .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
    .click({ timeout: 60_000 });
  await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
  await guidedSetupFrame
    .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
    .click();

  // --- Fill in the Configuration Form ---
  // NOTE: these fields don't have unique accessible labels, so we're using
  // positional (nth) locators for now. Fragile if the form's field order
  // ever changes — worth swapping for getByLabel() if/when we confirm the
  // actual <label> text for each field.
  await guidedSetupFrame.getByRole('textbox').nth(3).fill(''); // Export Data Sources List — left empty (TC-009)
  await guidedSetupFrame.getByRole('textbox').nth(2).fill(''); // Import Data Sources List — left empty (TC-008)
  await guidedSetupFrame.getByRole('textbox').first().fill(process.env.CLASSIFICATION_GROUP_NAME); // Classification Group

  await guidedSetupFrame.getByText('Yes').first().click(); // SMB Configuration toggle -> Yes
  await guidedSetupFrame.getByText('Yes').first().click(); // NFS Configuration toggle -> Yes

  await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
  await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

  // TODO: assert success once we know what confirms it worked
});