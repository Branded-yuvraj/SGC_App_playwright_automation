import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-010 - Specific MySQL Data Source Import', async ({ page }) => {
    test.setTimeout(300_000);

    const testAssetName = process.env.MYSQL_TEST_ASSET;

    await page.goto(process.env.SN_URL);

    // Open BigID Guided Setup
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }

    await page
        .getByRole('textbox', { name: 'Enter search term to filter' })
        .fill('bigid');

    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    // Configure Connection and Properties
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click();

    await guidedSetupFrame
        .getByRole('link', { name: ' Task completed Configure Properties' })
        .click();

    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();

    // Set Import Data Sources value
    await guidedSetupFrame.getByRole('textbox').nth(2).fill(testAssetName);

    // Save Configuration
    await guidedSetupFrame
        .getByRole('toolbar')
        .getByRole('button', { name: 'Save and Validate' })
        .click();

    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    // Return to Guided Setup (same pattern as TC-008)
    await page.goBack();

    const guidedSetupFrameAfterSave = page.locator('iframe[name="gsft_main"]').contentFrame();

    // Open Scheduled Imports
    await guidedSetupFrameAfterSave
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .click();

    await guidedSetupFrameAfterSave
        .getByRole('link', { name: ' Task in progress Import Data Sources' })
        .click();

    await guidedSetupFrameAfterSave
        .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
        .click();

    // Execute Import
    await guidedSetupFrameAfterSave.locator('#execute_bottom').click();

    // Allow import job time to complete
    await page.waitForTimeout(30_000);

    // --- Navigate to MySQL CI List via System Definition > Tables ---
    // (more reliable than typing a raw table name + .LIST into global search)
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton2 = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
    }

    const navigatorSearch = page.getByRole('textbox', { name: 'Enter search term to filter' });
    await navigatorSearch.click();
    await navigatorSearch.fill('Tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await tableSearchBox.click();
    await tableSearchBox.fill('cmdb_ci_db_mysql_instance');
    await tableSearchBox.press('Enter');

    await tablesFrame.getByRole('link', { name: 'Open record: MySQL Instance' }).click();

    // NOTE: this deep link is tied to this table's sys_id on THIS instance.
    // It's what codegen recorded after clicking "Show List" — kept as-is
    // since it's faster than re-clicking through, but if this ever breaks
    // after an instance change, replace with: tablesFrame.getByRole('link', { name: 'Show List' }).click()
    await page.goto(
        'https://dev403923.service-now.com/now/nav/ui/classic/params/target/sys_db_object.do%3Fsys_id%3De61b1ef908e003100a22e9371c04a483%26sysparm_record_target%3Dsys_db_object%26sysparm_record_row%3D1%26sysparm_record_rows%3D1%26sysparm_record_list%3Dsys_update_nameISNOTEMPTY%255EnameSTARTSWITHcmdb_ci_db_mysql_instance%255EORDERBYname'
    );
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();

    // --- Verify imported record exists, then open it ---
    await expect(
        tablesFrame.getByRole('link', { name: `Open record: ${testAssetName}` })
    ).toBeVisible({ timeout: 300_000 });

    await tablesFrame.getByRole('link', { name: `Open record: ${testAssetName}` }).click();

    // Verify imported record details
    await expect(
        tablesFrame
            .getByText(`Runs on::Runs (parent) - Servers [L1] ${testAssetName} MySQL Connection`)
            .nth(1)
    ).toBeVisible({ timeout: 60_000 });
});