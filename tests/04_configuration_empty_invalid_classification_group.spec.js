import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import 'dotenv/config';

// 1. Read and parse the Master CSV file at startup (using dataSource.csv)
const csvFilePath = path.join(__dirname, '../test-data/dataSource.csv'); 
const allRecords = parse(fs.readFileSync(csvFilePath, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});

// 2. FILTER records for Script 04
const records = allRecords.filter(row => row.SCRIPT_NO === '04');

const classificationGroupField = (frame) => frame.getByRole('textbox').first();

async function navigateToConfigureProperties(page) {
    // SN_URL is the only env variable used here for navigation
    await page.goto(process.env.SN_URL);
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }

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

    return guidedSetupFrame;
}

test.describe('Invalid Classification Group', () => {
    test.afterEach(async ({ page }) => {
        // Restore using a known valid classification group from your CSV (or a hardcoded safe fallback)
        const guidedSetupFrame = await navigateToConfigureProperties(page);
        const field = classificationGroupField(guidedSetupFrame);
        await field.dblclick();
        await field.fill('Sensitivity'); // Using a valid group directly from dataSource.csv instead of process.env
        await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
    });

    // 3. Loop through the filtered CSV rows dynamically
    for (const row of records) {
        test(`TC-${row.SCRIPT_NO}: Non-existent Classification Group (${row.CLASSIFICATION_GROUP_NAME}) is rejected`, async ({ page }) => {
            test.setTimeout(120_000);

            const guidedSetupFrame = await navigateToConfigureProperties(page);
            const field = classificationGroupField(guidedSetupFrame);

            await field.dblclick();
            // Fills invalid classification group dynamically from the CSV row
            await field.fill(row.CLASSIFICATION_GROUP_NAME);
            await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

            await expect(guidedSetupFrame.getByText('The classification group does')).toBeVisible();
            await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
        });
    }
});

// import { test, expect } from '@playwright/test';
// import 'dotenv/config';

// const classificationGroupField = (frame) => frame.getByRole('textbox').first();

// async function navigateToConfigureProperties(page) {
//     await page.goto(process.env.SN_URL);
//     await page.getByRole('menuitem', { name: 'All' }).click();

//     const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
//     if (await clearFilterButton.isVisible().catch(() => false)) {
//         await clearFilterButton.click();
//     }

//     await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
//     await page.getByRole('link', { name: 'Setup 1 of' }).click();

//     const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//         .click({ timeout: 60_000 });
//     await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
//     await guidedSetupFrame
//         .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
//         .click();

//     return guidedSetupFrame;
// }

// test.describe('TC-011: Invalid Classification Group', () => {
//     test.afterEach(async ({ page }) => {
//         // ALWAYS restore a valid Classification Group afterward, even if the
//         // test above fails partway — TC-005/TC-010 and others assume it's set.
//         const guidedSetupFrame = await navigateToConfigureProperties(page);
//         const field = classificationGroupField(guidedSetupFrame);
//         await field.dblclick();
//         await field.fill(process.env.CLASSIFICATION_GROUP_NAME);
//         await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
//         await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
//     });

//     test('TC-011: Non-existent Classification Group is rejected', async ({ page }) => {
//         test.setTimeout(120_000);

//         const guidedSetupFrame = await navigateToConfigureProperties(page);
//         const field = classificationGroupField(guidedSetupFrame);

//         await field.dblclick();
//         await field.fill('abc');
//         await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

//         await expect(guidedSetupFrame.getByText('The classification group does')).toBeVisible();
//         await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
//     });
// });