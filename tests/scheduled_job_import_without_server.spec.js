import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-016: Import fails when required server CI is missing', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(process.env.SN_URL);
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }

    // --- Precondition: delete any existing 'boris' server CI records ---
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('server');
    await page.getByRole('link', { name: 'All 1 of 10' }).click();

    const serverListFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    const serverSearch = serverListFrame.getByRole('searchbox', { name: 'Search' });
    await serverSearch.fill('boris');
    await serverSearch.press('Enter');

    // Select and delete each matching record
    // NOTE: these checkbox IDs are tied to specific sys_ids from your last
    // run — if this ever fails with "element not found", it likely means
    // no 'boris' records exist to delete anymore (which is actually fine —
    // see the guard below).
    const deleteAction = serverListFrame.getByLabel('Actions on selected rows');
    const firstCheckbox = serverListFrame.locator('#check_container_cmdb_ci_server_1f179cf2836e0310139374b6feaad32c');
    if (await firstCheckbox.isVisible().catch(() => false)) {
        await firstCheckbox.click();
        await deleteAction.selectOption('75a1fcce0a0a0b3400d6ed99cf8a87e0');
        await serverListFrame.getByRole('button', { name: 'Delete' }).click();
    }

    const secondCheckbox = serverListFrame.locator('#check_container_cmdb_ci_server_edd8903ac76e031063214ce914eb9827');
    if (await secondCheckbox.isVisible().catch(() => false)) {
        await secondCheckbox.click();
        await deleteAction.selectOption('75a1fcce0a0a0b3400d6ed99cf8a87e0');
        await serverListFrame.getByRole('button', { name: 'Delete' }).click();
    }

    // --- Configure import data source to target the (now-deleted) asset ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton2 = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
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

    const importDataSourcesField = guidedSetupFrame.getByRole('textbox').nth(2);
    await importDataSourcesField.click();
    await importDataSourcesField.press('ControlOrMeta+a');
    await importDataSourcesField.fill('boris mysql 1');
    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    // --- Run the import job ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .click({ timeout: 60_000 });
    await guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Sources' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
        .click();
    await guidedSetupFrame.locator('#execute_bottom').click();

    await page.waitForTimeout(30_000);

    // --- Check System Logs for the expected error ---
    // TODO: same as TC-014 — need the direct syslog_list.do URL and the
    // real error message text before we can assert anything here.
});