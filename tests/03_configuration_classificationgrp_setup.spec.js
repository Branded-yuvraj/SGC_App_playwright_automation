import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import 'dotenv/config';

// 1. Read and parse the Master CSV file at startup
const csvFilePath = path.join(__dirname, '../test-data/dataSource.csv'); 
const allRecords = parse(fs.readFileSync(csvFilePath, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});

// 2. FILTER the records so this test file ONLY processes rows meant for SCRIPT_NO '03'
const records = allRecords.filter(row => row.SCRIPT_NO === '03');

// 3. Loop through each filtered row in your CSV to execute the test dynamically
for (const row of records) {
  test(`TC-${row.SCRIPT_NO}: Save Configuration Form for (${row.CLASSIFICATION_GROUP_NAME})`, async ({ page }) => {
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
    await guidedSetupFrame.getByRole('textbox').nth(3).fill(''); // Export Data Sources List
    await guidedSetupFrame.getByRole('textbox').nth(2).fill(''); // Import Data Sources List
    
    // Fill Classification Group dynamically from the current CSV row using exact column name
    await guidedSetupFrame.getByRole('textbox').first().fill(row.CLASSIFICATION_GROUP_NAME);

    await guidedSetupFrame.getByText('Yes').first().click(); // SMB Configuration toggle -> Yes
    await guidedSetupFrame.getByText('Yes').first().click(); // NFS Configuration toggle -> Yes

    await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();

    // --- Assertion: Verify configuration saved successfully before clicking OK ---
    const successMessage = guidedSetupFrame.getByText('Application configuration saved successfully.');
    await expect(successMessage).toBeVisible({ timeout: 30_000 });

    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
  });
}

// import { test, expect } from '@playwright/test';
// import 'dotenv/config';

// test('Save valid Configuration Form (Classification Group)', async ({ page }) => {
//   test.setTimeout(120_000);

//   // --- Navigate to Guided Setup ---
//   await page.goto(process.env.SN_URL);
//   await page.getByRole('menuitem', { name: 'All' }).click();
//   await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
//   await page.getByRole('link', { name: 'Setup 1 of' }).click();

//   const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
//   await guidedSetupFrame
//     .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//     .click({ timeout: 60_000 });
//   await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
//   await guidedSetupFrame
//     .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
//     .click();

//   // --- Fill in the Configuration Form ---
//   // NOTE: these fields don't have unique accessible labels, so we're using
//   // positional (nth) locators for now. Fragile if the form's field order
//   // ever changes — worth swapping for getByLabel() if/when we confirm the
//   // actual <label> text for each field.
//   await guidedSetupFrame.getByRole('textbox').nth(3).fill(''); // Export Data Sources List — left empty (TC-009)
//   await guidedSetupFrame.getByRole('textbox').nth(2).fill(''); // Import Data Sources List — left empty (TC-008)
//   await guidedSetupFrame.getByRole('textbox').first().fill(process.env.CLASSIFICATION_GROUP_NAME); // Classification Group

//   await guidedSetupFrame.getByText('Yes').first().click(); // SMB Configuration toggle -> Yes
//   await guidedSetupFrame.getByText('Yes').first().click(); // NFS Configuration toggle -> Yes

//   await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
//   await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

//   // TODO: assert success once we know what confirms it worked
// });