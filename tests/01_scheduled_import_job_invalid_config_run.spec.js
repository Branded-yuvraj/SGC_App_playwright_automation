import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Running import without configured connection', async ({ page }) => {
    test.setTimeout(120_000);

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

    // Run the scheduled import job WITHOUT any connection configured
    await guidedSetupFrame.locator('#execute_bottom').click();

    // Give the job time to run and log its failure
    await page.waitForTimeout(30_000);

    // --- Navigate directly to System Logs, filtered to today, newest first ---
    await page.goto(
        'https://dev403923.service-now.com/now/nav/ui/classic/params/target/syslog_list.do%3Fsysparm_userpref_module%3Dab0b7690c0a8016400bdb8598ce01adf%26sysparm_query%3Dsys_created_onONToday%2540javascript%253Ags.daysAgoStart%25280%2529%2540javascript%253Ags.daysAgoEnd%25280%2529%255EEQ%26sysparm_order%3Dsys_created_on%26sysparm_order_direction%3Ddesc%26sysparm_clear_stack%3Dtrue'
    );

    const logsFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    await expect(
        logsFrame.getByRole('gridcell', {
            name: 'Service Graph Connector for BigID: BigIDSGAPIUtility: -> getDataSources: ->',
        })
    ).toBeVisible({ timeout: 60_000 });
});