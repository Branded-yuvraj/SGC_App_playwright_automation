import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-010 - Specific MySQL Data Source Import', async ({ page }) => {
    test.setTimeout(300_000);

    const testAssetName = process.env.MYSQL_TEST_ASSET;

    await page.goto(process.env.SN_URL);

    // Open BigID Guided Setup
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton = page.getByRole('button', {
        name: 'Clear filter'
    });

    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }

    await page
        .getByRole('textbox', {
            name: 'Enter search term to filter'
        })
        .fill('bigid');

    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    const guidedSetupFrame =
        page.locator('iframe[name="gsft_main"]').contentFrame();

    // Configure Connection and Properties
    await guidedSetupFrame
        .getByRole('button', {
            name: 'Select chain item to goto Configure Connection and Properties'
        })
        .click();

    await guidedSetupFrame
        .getByRole('link', {
            name: ' Task completed Configure Properties'
        })
        .click();

    await guidedSetupFrame
        .getByRole('link', {
            name: 'Configure Click to configure task Configure Properties'
        })
        .click();

    // Set Import Data Sources value
    await guidedSetupFrame
        .getByRole('textbox')
        .nth(2)
        .fill(testAssetName);

    // Save Configuration
    await guidedSetupFrame
        .getByRole('toolbar')
        .getByRole('button', {
            name: 'Save and Validate'
        })
        .click();

    await guidedSetupFrame
        .getByRole('button', {
            name: 'OK',
            exact: true
        })
        .click();

    // Return to Guided Setup (same pattern as TC-008)
    await page.goBack();

    const guidedSetupFrameAfterSave =
        page.locator('iframe[name="gsft_main"]').contentFrame();

    // Open Scheduled Imports
    await guidedSetupFrameAfterSave
        .getByRole('button', {
            name: 'Select chain item to goto Set'
        })
        .click();

    await guidedSetupFrameAfterSave
        .getByRole('link', {
            name: ' Task in progress Import Data Sources'
        })
        .click();

    await guidedSetupFrameAfterSave
        .getByRole('link', {
            name: 'Configure Click to configure task Import Data Sources'
        })
        .click();

    // Execute Import
    await guidedSetupFrameAfterSave
        .locator('#execute_bottom')
        .click();

    // Allow import job time to complete
    await page.waitForTimeout(30_000);

    // Navigate to MySQL CI List
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton2 = page.getByRole('button', {
        name: 'Clear filter'
    });

    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
    }

    const navigatorSearch = page.getByRole('textbox', {
        name: 'Enter search term to filter'
    });

    await navigatorSearch.click();
    await navigatorSearch.fill('cmdb_ci_');
    await navigatorSearch.fill('cmdb_ci_db_mysql_instance.LIST');
    await navigatorSearch.press('ArrowRight');

    const page1Promise = page.waitForEvent('popup');

    await navigatorSearch.press('Enter');

    const page1 = await page1Promise;

    const page1Frame =
        page1.locator('iframe[name="gsft_main"]').contentFrame();

    // Verify imported record exists
    await expect(
        page1Frame.getByRole('link', {
            name: `Open record: ${testAssetName}`
        })
    ).toBeVisible({
        timeout: 300_000
    });

    // Open imported record
    await page1Frame
        .getByRole('link', {
            name: `Open record: ${testAssetName}`
        })
        .click();

    // Verify imported record details
    await expect(
        page1Frame
            .getByText(
                `Runs on::Runs (parent) - Servers [L1] ${testAssetName} MySQL Connection`
            )
            .nth(1)
    ).toBeVisible({
        timeout: 60_000
    });
});
``