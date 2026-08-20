import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-008 - Leave Import Data Sources empty', async ({ page }) => {
    test.setTimeout(300_000); // 5 minutes

    await page.goto(process.env.SN_URL);

    // Open BigID Guided Setup
    await page.getByRole('menuitem', { name: 'All' }).click();

    await page
        .getByRole('textbox', {
            name: 'Enter search term to filter'
        })
        .fill('bigid');

    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    const guidedSetupFrame =
        page.locator('iframe[name="gsft_main"]').contentFrame();

    // Open Configure Connection and Properties
    await guidedSetupFrame
        .getByRole('button', {
            name: 'Select chain item to goto Configure Connection and Properties'
        })
        .click();

    // Open Configure Properties
    await guidedSetupFrame
        .getByRole('link', {
            name: ' Task completed Configure Properties'
        })
        .click();

    // Open Configure Properties form
    await guidedSetupFrame
        .getByRole('link', {
            name: 'Configure Click to configure task Configure Properties'
        })
        .click();

    // Leave Import Data Sources blank
    await guidedSetupFrame
        .getByRole('textbox')
        .nth(2)
        .clear();

    // Save configuration
    await guidedSetupFrame
        .getByRole('toolbar')
        .getByRole('button', {
            name: 'Save and Validate'
        })
        .click();

    // Confirm dialog
    await guidedSetupFrame
        .getByRole('button', {
            name: 'OK',
            exact: true
        })
        .click();

    // Return to Guided Setup
    await page.goBack();

    const guidedSetupFrameAfterBack =
        page.locator('iframe[name="gsft_main"]').contentFrame();

    // Open Set up Scheduled Data Imports
    await guidedSetupFrameAfterBack
        .getByRole('button', {
            name: 'Select chain item to goto Set'
        })
        .click();

    // Open Import Data Sources
    await guidedSetupFrameAfterBack
        .getByRole('link', {
            name: ' Task in progress Import Data Sources'
        })
        .click();

    // Open Import Data Sources
    await guidedSetupFrameAfterBack
        .getByRole('link', {
            name: 'Configure Click to configure task Import Data Sources'
        })
        .click();

    // Run scheduled import job
    await guidedSetupFrameAfterBack
        .locator('#execute_bottom')
        .click();

    // Open System Logs
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
        .fill('system logs');

    await page.getByRole('link', { name: 'All 1 of' }).click();

    // Give ServiceNow time to write the log entry
    await page.waitForTimeout(30_000);

    // Refresh System Logs page
    await page.reload();

    const logsFrame =
        page.locator('iframe[name="gsft_main"]').contentFrame();

    // Verify scheduled job completed successfully
    await expect(
        logsFrame.getByRole('gridcell', {
            name: 'Service Graph Connector for BigID : BigID Data Sources Import Scheduled Job : end',
            exact: true
        })
    ).toBeVisible({
        timeout: 300_000
    });
});