import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-012: Scheduled import job completes successfully', async ({ page }) => {
    test.setTimeout(180_000);

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
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .click({ timeout: 60_000 });
    await guidedSetupFrame
        .getByRole('link', { name: ' Task in progress Import Data Sources' })
        .click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
        .click();

    // --- Trigger the scheduled import job ---
    await guidedSetupFrame.locator('#execute_bottom').click();

    // Give the job time to actually finish before checking results
    await page.waitForTimeout(30_000);

    // --- Navigate to Import Sets list ---
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton2 = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
    }

    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('import sets');
    await page.getByRole('link', { name: 'Import Sets 1 of' }).click();

    const importSetsFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    // Open the MOST RECENT import set, not a hardcoded record number —
    // a new one is created every time this test runs. Assumes the list is
    // sorted newest-first (ServiceNow's default) — confirm this holds if
    // the assertion below ever opens a stale/wrong record.
    await importSetsFrame
        .getByRole('link', { name: /^Open record: ISET/ })
        .first()
        .click();

    // --- Verify the job completed successfully ---
    await expect(importSetsFrame.getByRole('gridcell', { name: 'Complete' })).toBeVisible({
        timeout: 60_000,
    });
    await expect(importSetsFrame.getByRole('gridcell', { name: 'Processed' }).first()).toBeVisible();
});