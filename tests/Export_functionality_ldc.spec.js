import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Logical Datacenter export workflow', async ({ page }) => {
    test.setTimeout(480_000);

    const snUrl = process.env.SN_URL;
    const dataSourceName = process.env.EXPORT_LDC_DATASOURCE;         // e.g. dev69420_s3_host
    const logicalDatacenterName = process.env.EXPORT_LDC_DATACENTER;  // e.g. dev69420_ldc
    const tableName = process.env.EXPORT_LDC_CI_CLASS;                // e.g. cmdb_ci_aws_s3_endpoint

    // Only S3 uses "Host" as its identifying field — everything else uses plain "Name".
    const nameFieldLabel = tableName === 'cmdb_ci_aws_s3_endpoint' ? 'Host' : 'Name';

    const relType = 'Hosted on::Hosts';

    const expectedLogNew = 'Service Graph Connector for BigID: BusinessOperationsUtility: ->';
    const expectedLogExisting = 'Service Graph Connector for BigID: BigIDSyncDSFunctions -> exportDataSource -> Finished Exporting Data Sources : Exported [0] and Updated [1]';
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    await page.goto(snUrl);
    const gsftMain = page.locator('iframe[name="gsft_main"]').contentFrame();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });

    // --- 1. Find or create the Data Source CI ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    await page.waitForTimeout(3_000);
    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await tableSearchBox.fill(tableName);
    await page.waitForTimeout(2_000);
    await tableSearchBox.press('Enter');
    await page.waitForTimeout(3_000);

    await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
    await page.waitForTimeout(2_000);
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();
    await page.waitForTimeout(2_000);

    const dsSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    if (await dsSearchBox.isVisible().catch(() => false)) {
        await dsSearchBox.fill(dataSourceName);
        await dsSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingDsLink = tablesFrame
        .getByRole('link', { name: new RegExp(`^Open record: ${escapeRegex(dataSourceName)}$`) })
        .first();
    const dsAlreadyExists = await existingDsLink.isVisible({ timeout: 15_000 }).catch(() => false);

    if (dsAlreadyExists) {
        console.log(`Data Source CI "${dataSourceName}" already exists — skipping creation.`);
    } else {
        console.log(`Data Source CI "${dataSourceName}" not found — creating it.`);
        
        const newButton = tablesFrame.getByRole('button', { name: 'New' });
        await newButton.waitFor({ state: 'visible', timeout: 15_000 });
        await newButton.click();
        
        await page.waitForTimeout(2_000);
        await tablesFrame.getByRole('textbox', { name: nameFieldLabel, exact: true }).fill(dataSourceName);
        await tablesFrame.locator('#sysverb_insert_bottom').click();
        await page.waitForTimeout(3_000);
    }

    // --- 1.4. Special Handling for S3 Endpoint: Update Name via API ---
    if (tableName === 'cmdb_ci_aws_s3_endpoint') {
        console.log(`[S3 Debug] CI class is cmdb_ci_aws_s3_endpoint — initiating API update for Name.`);

        page.on('console', msg => {
            if (msg.text().includes('[S3 Browser API]')) {
                console.log(msg.text());
            }
        });

        await page.evaluate(async ({ tableName, dataSourceName }) => {
            const token = window.g_ck || (window.top && window.top.g_ck) || '';
            const queryUrl = `/api/now/table/${tableName}?sysparm_query=ORDERBYDESCsys_created_on&sysparm_limit=1`;
            
            try {
                const getRes = await fetch(queryUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'X-UserToken': token
                    }
                });
                
                const responseText = await getRes.text();
                let getData = JSON.parse(responseText);

                if (getData.result && getData.result.length > 0) {
                    const sysId = getData.result[0].sys_id;
                    const updateUrl = `/api/now/table/${tableName}/${sysId}`;
                    
                    const updateRes = await fetch(updateUrl, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-UserToken': token
                        },
                        body: JSON.stringify({ name: dataSourceName })
                    });
                    
                    if (updateRes.ok) {
                        console.log(`[S3 Browser API] SUCCESSFULLY updated S3 record (${sysId}) name to: ${dataSourceName}`);
                    } else {
                        console.log(`[S3 Browser API] ERROR: Failed to update S3 record name.`);
                    }
                }
            } catch (err) {
                console.log(`[S3 Browser API] Exception caught during fetch: ${err.message}`);
            }
        }, { tableName, dataSourceName });

        await page.waitForTimeout(3_000);
    }

    // --- 1.5. Check Column & Value for File Systems (SMB/NFS) and S3 Endpoints ---
    if (tableName === 'cmdb_ci_file_system_smb' || tableName === 'cmdb_ci_file_system_nfs' || tableName === 'cmdb_ci_aws_s3_endpoint') {
        const isS3 = tableName === 'cmdb_ci_aws_s3_endpoint';
        const columnName = isS3 ? 'type' : 'storage_type';
        const columnLabel = isS3 ? 'Type' : 'Storage type';
        const targetValue = isS3 ? 's3-v2' : (process.env.EXPORT_LDC_STORAGE_TYPE || (tableName === 'cmdb_ci_file_system_smb' ? 'smb_v2' : 'nfs'));

        console.log(`CI class is ${tableName} — verifying ${columnName} list view and value (${targetValue}).`);

        // Ensure we navigate cleanly to the table list view
        await page.getByRole('menuitem', { name: 'All' }).click();
        if (await clearFilterButton.isVisible().catch(() => false)) {
            await clearFilterButton.click();
        }
        await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
        await page.getByRole('link', { name: 'Tables 1 of 5' }).click();
        await page.waitForTimeout(3_000);

        const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
        await tableSearchBox.fill(tableName);
        await page.waitForTimeout(2_000);
        await tableSearchBox.press('Enter');
        await page.waitForTimeout(3_000);

        await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
        await page.waitForTimeout(2_000);
        await tablesFrame.getByRole('link', { name: 'Show List' }).click();
        await page.waitForTimeout(4_000);

        const instanceSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
        if (await instanceSearchBox.isVisible().catch(() => false)) {
            await instanceSearchBox.fill(dataSourceName);
            await instanceSearchBox.press('Enter');
            await page.waitForTimeout(3_000);
        }

        const columnHeader = tablesFrame.locator(`th[data-column-name="${columnName}"], th:has-text("${columnLabel}")`).first();
        const isColumnPresent = await columnHeader.isVisible({ timeout: 5_000 }).catch(() => false);

        if (!isColumnPresent) {
            console.log(`${columnName} column is missing from list view — opening Personalized List to add it.`);
            
            const personalizeBtn = tablesFrame.getByRole('button', { name: 'Update Personalized List' })
                .or(tablesFrame.getByRole('button', { name: 'Personalize List' }));
            
            await personalizeBtn.waitFor({ state: 'visible', timeout: 30_000 });
            await personalizeBtn.click();
            await page.waitForTimeout(2_000);

            const availableSelect = tablesFrame.getByLabel('Available');
            await availableSelect.waitFor({ state: 'visible', timeout: 15_000 });
            
            await availableSelect.selectOption(columnName).catch(() => {});
            await page.waitForTimeout(1_000);

            const addBtn = tablesFrame.getByRole('button', { name: /Add selected options/i }).first();
            await addBtn.click();
            await page.waitForTimeout(1_000);

            const okBtn = tablesFrame.getByRole('button', { name: 'OK', exact: true });
            await okBtn.click();
            await page.waitForTimeout(5_000);

            if (await instanceSearchBox.isVisible().catch(() => false)) {
                await instanceSearchBox.fill(dataSourceName);
                await instanceSearchBox.press('Enter');
                await page.waitForTimeout(3_000);
            }
        } else {
            console.log(`${columnName} column is already visible in the list view.`);
        }

        const recordLink = tablesFrame.getByRole('link', { name: new RegExp(`^Open record: ${escapeRegex(dataSourceName)}$`) }).first();
        const targetRow = tablesFrame.locator(`tr[id^="row_${tableName}_"]`).filter({ has: recordLink }).first();

        const existingCell = targetRow.getByRole('gridcell', { name: targetValue, exact: true }).first();
        const valueAlreadyExists = await existingCell.isVisible({ timeout: 3_000 }).catch(() => false);

        if (valueAlreadyExists) {
            console.log(`Value "${targetValue}" already exists for "${dataSourceName}" — skipping update.`);
        } else {
            console.log(`Value "${targetValue}" is missing or different for "${dataSourceName}" — setting it.`);
            
            const cellToEdit = targetRow.locator(`[data-column-name="${columnName}"]`).first();
            if (await cellToEdit.isVisible().catch(() => false)) {
                await cellToEdit.dblclick();
            } else {
                await targetRow.locator('td').last().dblclick();
            }
            await page.waitForTimeout(1_000);

            const typeInput = tablesFrame.getByRole('textbox', { name: columnLabel })
                .or(tablesFrame.locator('input.filer-input, input[type="text"]')).last();
            await typeInput.waitFor({ state: 'visible', timeout: 5_000 });
            await typeInput.fill(targetValue);
            await typeInput.press('Enter');
            await page.waitForTimeout(2_000);
        }
    }

    // --- 2. Find or create the Logical Datacenter CI ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    await page.waitForTimeout(3_000);

    const ldcTableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    await ldcTableSearchBox.fill('cmdb_ci_logical_datacenter');
    await page.waitForTimeout(2_000);
    await ldcTableSearchBox.press('Enter');
    await page.waitForTimeout(3_000);

    await tablesFrame.getByRole('link', { name: /^Open record:/i }).first().click();
    await page.waitForTimeout(2_000);
    await tablesFrame.getByRole('link', { name: 'Show List' }).click();
    await page.waitForTimeout(2_000);

    const ldcSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    if (await ldcSearchBox.isVisible().catch(() => false)) {
        await ldcSearchBox.fill(logicalDatacenterName);
        await ldcSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingLdcLink = tablesFrame
        .getByRole('link', { name: new RegExp(`^Open record: ${escapeRegex(logicalDatacenterName)}$`) })
        .first();
    const ldcAlreadyExists = await existingLdcLink.isVisible({ timeout: 15_000 }).catch(() => false);

    if (ldcAlreadyExists) {
        console.log(`Logical Datacenter "${logicalDatacenterName}" already exists — skipping creation.`);
    } else {
        console.log(`Logical Datacenter "${logicalDatacenterName}" not found — creating it.`);
        
        const newLdcButton = tablesFrame.getByRole('button', { name: 'New' });
        await newLdcButton.waitFor({ state: 'visible', timeout: 15_000 });
        await newLdcButton.click();
        
        await page.waitForTimeout(2_000);
        await tablesFrame.getByRole('textbox', { name: 'Name', exact: true }).fill(logicalDatacenterName);
        await tablesFrame.locator('#sysverb_insert_bottom').click();
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
        await relParentSearchBox.fill(dataSourceName);
        await relParentSearchBox.press('Enter');
        await page.waitForTimeout(3_000);
    }

    const existingRelationship = tablesFrame.getByText(logicalDatacenterName).first();
    const relationshipAlreadyExists = await existingRelationship.isVisible({ timeout: 15_000 }).catch(() => false);

    if (relationshipAlreadyExists) {
        console.log(`Relationship between "${dataSourceName}" and "${logicalDatacenterName}" already exists in cmdb_rel_ci — skipping.`);
    } else {
        console.log(`Relationship not found in cmdb_rel_ci — creating it.`);
        
        const newRelButton = tablesFrame.getByRole('button', { name: 'New' });
        await newRelButton.waitFor({ state: 'visible', timeout: 15_000 });
        await newRelButton.click();

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
        await selectViaPopup('Parent', dataSourceName);
        await page.waitForTimeout(1_000);

        // Fill Child via lookup popup
        await selectViaPopup('Child', logicalDatacenterName);
        await page.waitForTimeout(1_000);

        // Fill Type via lookup popup
        await selectViaPopup('Type', relType);
        await page.waitForTimeout(1_000);

        await tablesFrame.locator('#sysverb_insert_bottom').click();
        await page.waitForTimeout(2_000);
    }

    // --- 4. Configure Properties in BigID Setup ---
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

    const exportField = gsftMain.getByRole('textbox').nth(3);
    await exportField.waitFor({ state: 'visible', timeout: 30_000 });
    await exportField.dblclick();
    await exportField.fill('');
    await exportField.fill(dataSourceName);

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

    const failureLog = gsftMain.getByText(/Failed to (Create|Update) Data Source/i).first();
    const failureFound = await failureLog.isVisible({ timeout: 10_000 }).catch(() => false);

    if (failureFound) {
        const failureText = await failureLog.innerText().catch(() => '(could not read failure text)');
        expect(failureFound, `Export failed: "${failureText}"`).toBeFalsy();
    }

    const [createdVisible, updatedVisible, existingLogVisible] = await Promise.all([
        gsftMain.getByText(/Created Data Source:/i).first().isVisible({ timeout: 30_000 }).catch(() => false),
        gsftMain.getByText(/Updated Data Source:/i).first().isVisible({ timeout: 5_000 }).catch(() => false),
        gsftMain
            .getByRole('gridcell', { name: expectedLogExisting, exact: true })
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false),
    ]);

    console.log(`Created: ${createdVisible}, Updated: ${updatedVisible}, Existing-summary: ${existingLogVisible}`);
    expect(
        createdVisible || updatedVisible || existingLogVisible,
        'No successful export log message was found'
    ).toBeTruthy();
});