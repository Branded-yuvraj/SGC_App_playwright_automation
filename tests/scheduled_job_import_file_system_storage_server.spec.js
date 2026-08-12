import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-023: Storage File Share import with storage server prerequisite', async ({ page }) => {
    test.setTimeout(180_000);

    const storageFileshareDataSource = process.env.STORAGE_FILESHARE_DATA_SOURCE;
    const storageServer = process.env.STORAGE_FILESHARE_SERVER;
    const smbKeyword = process.env.STORAGE_FILESHARE_KEYWORD;

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

    // --- Set Import Data Sources to the target SMB asset ---
    const importDataSourcesField = guidedSetupFrame.getByRole('textbox').nth(2);
    await importDataSourcesField.waitFor({ state: 'visible', timeout: 60_000 });
    await importDataSourcesField.click();
    await importDataSourcesField.press('ControlOrMeta+a');
    await importDataSourcesField.fill(storageFileshareDataSource);

    // --- Disable "use default SMB" so the connector uses the Storage File Share
    //     table instead of SMB File System (confirmed manually) ---
    const useDefaultSmbCheckbox = guidedSetupFrame.locator('#use_default_smb_n');
    await useDefaultSmbCheckbox.waitFor({ state: 'visible', timeout: 60_000 });
    await useDefaultSmbCheckbox.check();

    // --- Fill the keyword field (only appears after unchecking "use default") ---
    // --- Fill the keyword field (only appears after unchecking "use default") ---
    // NOTE: replaced the old Angular-state-class locator (ng-pristine/ng-untouched/etc.)
    // — multiple empty fields on this form share those classes, making it ambiguous.
    // Scoping by the field's actual label text is reliable instead.
    const keywordField = guidedSetupFrame
        .getByText('Provide keyword to identify SMB Datasource record', { exact: true })
        .locator('xpath=..')
        .getByRole('textbox');

    await keywordField.waitFor({ state: 'visible', timeout: 60_000 });
    await keywordField.fill(smbKeyword);

    await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
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

    // --- Navigate to Storage File Share table via System Definition > Tables ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton2 = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton2.isVisible().catch(() => false)) {
        await clearFilterButton2.click();
    }

    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await tableSearchBox.fill('cmdb_ci_storage_fileshare');
    await tableSearchBox.press('Enter');

    await tablesFrame
        .getByRole('row', { name: 'Mark record for List Action: Storage File Share Select record for action:' })
        .getByLabel('Open record: Storage File')
        .click();
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();

    // --- Verify the imported record exists, then open it ---
    await expect(
        tablesFrame.getByRole('link', { name: `Open record: ${storageFileshareDataSource}` })
    ).toBeVisible({ timeout: 60_000 });

    await tablesFrame.getByRole('link', { name: `Open record: ${storageFileshareDataSource}` }).click();

    // --- Verify the storage server relationship was created ---
    await expect(
        tablesFrame
            .getByText(`Provided By::Provides (parent) - Storage Servers [L1] ${storageServer}`)
            .nth(1)
    ).toBeVisible({ timeout: 60_000 });
});