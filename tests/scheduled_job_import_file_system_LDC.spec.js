import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-021: SMB data source import with logical datacenter prerequisite', async ({ page }) => {
    test.setTimeout(180_000);

    const smbDataSource = process.env.SMB_DATA_SOURCE;
    const smbLogicalDatacenter = process.env.SMB_LOGICAL_DATACENTER;

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
        .waitFor({ state: 'attached', timeout: 60_000 });
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click();

    await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();

    // --- Set Import Data Sources to the SMB asset ---
    const importDataSourcesField = guidedSetupFrame.getByRole('textbox').nth(2);
    await importDataSourcesField.click();
    await importDataSourcesField.press('ControlOrMeta+a');
    await importDataSourcesField.fill(smbDataSource);

    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    // --- Run the import job ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .click();

    await guidedSetupFrame
        .getByRole('link', { name: ' Task in progress Import Data Sources' })
        .click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
        .click();
    await guidedSetupFrame.locator('#execute_bottom').click();

    await page.waitForTimeout(30_000);

    // --- Navigate to the SMB File System table via System Definition > Tables ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton2 = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
    }

    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await tableSearchBox.fill('cmdb_ci_file_system_smb');
    await tableSearchBox.press('Enter');

    await tablesFrame.getByRole('link', { name: 'Open record: SMB File system' }).click();
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();

    // --- Verify the imported record exists, then open it ---
    await expect(
        tablesFrame.getByRole('link', { name: `Open record: ${smbDataSource}` })
    ).toBeVisible({ timeout: 60_000 });

    await tablesFrame.getByRole('link', { name: `Open record: ${smbDataSource}` }).click();

    // --- Verify the logical datacenter relationship was created ---
    await expect(
        tablesFrame
            .getByText(`Hosted on::Hosts (parent) - Logical Datacenters [L1] ${smbLogicalDatacenter}`)
            .nth(1)
    ).toBeVisible({ timeout: 60_000 });
});