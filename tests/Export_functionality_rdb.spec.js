import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Server and Instance export workflow', async ({ page }) => {
    test.setTimeout(180_000);

    const snUrl = process.env.SN_URL;
    const instanceName = process.env.EXPORT_MYSQL_INSTANCE; // e.g. dev69420_oracle_pdb_instance
    const serverName = process.env.EXPORT_MYSQL_SERVER;     // e.g. dev69420_oracle_pdb_server
    const tableName = process.env.EXPORT_MYSQL_CI_CLASS;    // cmdb_ci_db_ora_pdb_instance

    const isOraclePdb = tableName === 'cmdb_ci_db_ora_pdb_instance';
    
    const parentCIName = serverName || 'dev69420_oracle_instance';
    const parentClass = isOraclePdb ? 'cmdb_ci_db_ora_instance' : 'cmdb_ci_server';
    const relType = isOraclePdb ? 'Managed by::Manages' : 'Runs on::Runs';

    const expectedLogNew = 'Service Graph Connector for BigID: BusinessOperationsUtility: ->';
    const expectedLogExisting = 'Service Graph Connector for BigID: BigIDSyncDSFunctions -> exportDataSource -> Finished Exporting Data Sources : Exported [0] and Updated [1]';
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    await page.goto(snUrl);
    const gsftMain = page.locator('iframe[name="gsft_main"]').contentFrame();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });

    // --- 1. Find or create the Parent CI ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    await page.waitForTimeout(3_000);
    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await tableSearchBox.fill(parentClass);
    await page.waitForTimeout(2_000);
    await tableSearchBox.press('Enter');
    await page.waitForTimeout(3_000);

    await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
    await page.waitForTimeout(2_000);
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();
    await page.waitForTimeout(2_000);

    const parentSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    if (await parentSearchBox.isVisible().catch(() => false)) {
        await parentSearchBox.fill(parentCIName);
        await parentSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingParentLink = tablesFrame
        .getByRole('link', { name: new RegExp(`^Open record: ${escapeRegex(parentCIName)}$`) })
        .first();
    const parentAlreadyExists = await existingParentLink.isVisible({ timeout: 15_000 }).catch(() => false);

    if (parentAlreadyExists) {
        console.log(`Parent CI "${parentCIName}" already exists — skipping creation.`);
    } else {
        console.log(`Parent CI "${parentCIName}" not found — creating it.`);
        await tablesFrame.getByRole('button', { name: 'New' }).click();
        await page.waitForTimeout(2_000);
        await tablesFrame.getByRole('textbox', { name: 'Name', exact: true }).fill(parentCIName);
        await tablesFrame.locator('#sysverb_insert_bottom').click();
        await page.waitForTimeout(2_000);
    }

    // --- 2. Find or create the PDB Instance CI ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    await page.waitForTimeout(3_000);

    const instanceTableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await instanceTableSearchBox.fill(tableName);
    await page.waitForTimeout(2_000);
    await instanceTableSearchBox.press('Enter');
    await page.waitForTimeout(3_000);

    await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
    await page.waitForTimeout(2_000);
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();
    await page.waitForTimeout(2_000);

    const instanceSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    if (await instanceSearchBox.isVisible().catch(() => false)) {
        await instanceSearchBox.fill(instanceName);
        await instanceSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingInstanceLink = tablesFrame
        .getByRole('link', { name: new RegExp(`^Open record: ${escapeRegex(instanceName)}$`) })
        .first();
    const instanceAlreadyExists = await existingInstanceLink.isVisible({ timeout: 15_000 }).catch(() => false);

    if (instanceAlreadyExists) {
        console.log(`PDB Instance "${instanceName}" already exists — skipping creation.`);
        await existingInstanceLink.click();
        await page.waitForTimeout(2_000);
    } else {
        console.log(`PDB Instance "${instanceName}" not found — creating it.`);
        await tablesFrame.getByRole('button', { name: 'New' }).click();
        await page.waitForTimeout(2_000);
        await tablesFrame.getByRole('textbox', { name: 'Name', exact: true }).fill(instanceName);
        await tablesFrame.locator('#sysverb_insert_bottom').click();
        await page.waitForTimeout(2_000);

        await tablesFrame.getByRole('link', { name: `Open record: ${instanceName}` }).click();
        await page.waitForTimeout(2_000);
    }

    // --- 3. Check if the Relationship already exists via cmdb_rel_ci table ---
    await page.waitForTimeout(3_000);

    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();
    await page.waitForTimeout(3_000);

    const relTableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await relTableSearchBox.fill('cmdb_rel_ci');
    await page.waitForTimeout(2_000);
    await relTableSearchBox.press('Enter');
    await page.waitForTimeout(3_000);

    await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
    await page.waitForTimeout(2_000);
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();
    await page.waitForTimeout(2_000);

    const relParentSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: parent' });
    if (await relParentSearchBox.isVisible().catch(() => false)) {
        await relParentSearchBox.fill(instanceName);
        await relParentSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingRelationship = tablesFrame.getByText(parentCIName).first();
    const relationshipAlreadyExists = await existingRelationship.isVisible({ timeout: 15_000 }).catch(() => false);

    if (relationshipAlreadyExists) {
        console.log(`Relationship between PDB Instance "${instanceName}" and Parent CI "${parentCIName}" already exists in cmdb_rel_ci — skipping.`);
    } else {
        console.log(`Relationship not found in cmdb_rel_ci — creating it.`);
        await tablesFrame.getByRole('button', { name: 'New' }).click();
        await page.waitForTimeout(4_000);

        async function selectViaPopup(fieldName, lookupValue) {
            const popupPromise = page.waitForEvent('popup');
            await tablesFrame.getByRole('button', { name: `Look up value for field: ${fieldName}` }).click();
            const popup = await popupPromise;
            await popup.waitForLoadState('load');
            await popup.waitForTimeout(2_000);

            const popupSearch = popup.getByRole('searchbox').first();
            if (await popupSearch.isVisible().catch(() => false)) {
                await popupSearch.fill(lookupValue);
                await popupSearch.press('Enter');
                await popup.waitForTimeout(2_000);
            }

            await popup.getByRole('button', { name: lookupValue, exact: true }).first().click();
            await page.waitForTimeout(2_000);
        }

        // Fill Parent via lookup popup
        await selectViaPopup('Parent', instanceName);
        await page.waitForTimeout(1_000);

        // Fill Child via lookup popup
        await selectViaPopup('Child', parentCIName);
        await page.waitForTimeout(1_000);

        // Fill Type via lookup popup
        await selectViaPopup('Type', relType);
        await page.waitForTimeout(1_000);

        await tablesFrame.locator('#sysverb_insert_bottom').click();
        await page.waitForTimeout(2_000);
    }

    // --- 4. Configure Properties in BigID Setup (with both fields updated) ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.waitForTimeout(3_000);
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForTimeout(2_000);

    await gsftMain
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await gsftMain
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click();
    await gsftMain.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await gsftMain.getByRole('link', { name: 'Configure Click to configure task Configure Properties' }).click();
    await page.waitForTimeout(2_000);

    // Update first configuration textbox (nth 3)
    const configTextBox1 = gsftMain.getByRole('textbox').nth(3);
    await configTextBox1.waitFor({ state: 'visible', timeout: 30_000 });
    await configTextBox1.dblclick();
    await configTextBox1.fill('');
    await configTextBox1.fill(instanceName);

    // Update second configuration textbox / pdb filter field (nth 5) with the exact same value
    const configTextBox2 = gsftMain.getByRole('textbox').nth(5);
    await configTextBox2.waitFor({ state: 'visible', timeout: 30_000 });
    await configTextBox2.click();
    await configTextBox2.fill('');
    await configTextBox2.fill(instanceName);

    await gsftMain.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
    await page.waitForTimeout(2_000);
    await gsftMain.getByRole('button', { name: 'OK', exact: true }).click();

    // --- 5. Run the Export Scheduled Job ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForTimeout(2_000);

    await gsftMain
        .getByRole('button', { name: 'Select chain item to goto Configure the Scheduled Job to Export Data Sources' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await gsftMain
        .getByRole('button', { name: 'Select chain item to goto Configure the Scheduled Job to Export Data Sources' })
        .click();
    await gsftMain.getByRole('link', { name: ' Task in progress Export' }).click();
    await gsftMain.getByRole('link', { name: 'Configure Click to configure' }).click();

    await page.goto(`${snUrl}/now/nav/ui/classic/params/target/sysauto_script.do%3Fsys_id%3D90fdf7e99395421047d3b0a08bba108f`);
    await page.waitForTimeout(2_000);
    await gsftMain.locator('#execute_bottom').click();

    await page.waitForTimeout(10_000);

    // --- 6. Navigate to Logs and Assert Final Message ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('em logs');
    await page.getByRole('link', { name: 'All 1 of' }).click();
    await page.waitForTimeout(2_000);

    const [newLogVisible, existingLogVisible] = await Promise.all([
        gsftMain
            .getByRole('gridcell', { name: expectedLogNew })
            .first()
            .isVisible({ timeout: 30_000 })
            .catch(() => false),
        gsftMain
            .getByRole('gridcell', { name: expectedLogExisting, exact: true })
            .first()
            .isVisible({ timeout: 30_000 })
            .catch(() => false),
    ]);

    console.log(`New-export log found: ${newLogVisible}, Existing-update log found: ${existingLogVisible}`);
    expect(
        newLogVisible || existingLogVisible,
        'Neither the new-export nor existing-update log message was found'
    ).toBeTruthy();
});