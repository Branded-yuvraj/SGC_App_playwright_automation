import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Storage File Share export workflow via API', async ({ page }) => {
    test.setTimeout(480_000);

    const snUrl = process.env.SN_URL;
    const dataSourceName = process.env.EXPORT_STORAGESERVER_DATASOURCE;         // e.g. dev69420_smb3_instance
    const storageServerName = process.env.EXPORT_STORAGESERVER_SERVER;          // e.g. dev69420_smb3_server
    const storageTypeInput = process.env.EXPORT_STORAGE_TYPE || 'smb';          // e.g. smb or nfs
    const tableName = 'cmdb_ci_storage_fileshare';                              // Always target storage file share
    const fileShareKeyword = process.env.EXPORT_FILESHARE_KEYWORD;

    const expectedLogExisting = 'Service Graph Connector for BigID: BigIDSyncDSFunctions -> exportDataSource -> Finished Exporting Data Sources : Exported [0] and Updated [1]';

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    // Forward browser console logs containing '[API Automation]' directly to your terminal
    page.on('console', msg => {
        if (msg.text().includes('[API Automation]')) {
            console.log(msg.text());
        }
    });

    // --- 1, 2 & 3. Pure API-Driven Data Setup, Storage Server Creation, and Relationship Mapping ---
    console.log(`Starting API-driven CMDB setup for class: ${tableName} with keyword: ${fileShareKeyword}`);

    await page.evaluate(async ({ tableName, dataSourceName, storageServerName, storageTypeInput, fileShareKeyword }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        console.log(`[API Automation] Session Token found: ${token ? 'YES (' + token.substring(0, 5) + '...)' : 'NO'}`);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        // --- 1. Handle Data Source CI (Create or Update with conditional File Share ID check) ---
        const queryField = 'name';

        console.log(`[API Automation] Checking if Data Source exists on table "${tableName}" where ${queryField} = "${dataSourceName}"`);
        const dsGetRes = await fetch(`/api/now/table/${tableName}?sysparm_query=${queryField}=${encodeURIComponent(dataSourceName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const dsGetData = await dsGetRes.json();
        let dsSysId = '';

        if (dsGetData.result && dsGetData.result.length > 0) {
            const existingRecord = dsGetData.result[0];
            dsSysId = existingRecord.sys_id;
            const existingFileShareId = existingRecord.fileshare_id || '';

            console.log(`[API Automation] Data Source already exists with sys_id: ${dsSysId}. Checking fileshare_id column...`);

            // Check if fileshare_id contains the keyword
            if (!existingFileShareId.includes(fileShareKeyword)) {
                // If it doesn't contain it, append it (or overwrite depending on your preference. Here we append with a comma/space or set it if empty)
                const updatedFileShareId = existingFileShareId
                    ? `${existingFileShareId}, ${fileShareKeyword}`
                    : fileShareKeyword;

                console.log(`[API Automation] Existing file share ID does not contain keyword. Updating fileshare_id to: "${updatedFileShareId}"`);

                const updateRes = await fetch(`/api/now/table/${tableName}/${dsSysId}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({
                        storage_type: storageTypeInput,
                        fileshare_id: updatedFileShareId
                    })
                });
                console.log(`[API Automation] Data Source Update Status: ${updateRes.status}`);
            } else {
                console.log(`[API Automation] fileshare_id already contains the keyword "${fileShareKeyword}". Skipping update.`);
            }
        } else {
            console.log(`[API Automation] Data Source not found. Creating new record with File Share ID: ${fileShareKeyword}...`);
            const dsPayload = {
                name: dataSourceName,
                storage_type: storageTypeInput,
                fileshare_id: fileShareKeyword
            };

            const createRes = await fetch(`/api/now/table/${tableName}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify(dsPayload)
            });
            const createData = await createRes.json();
            if (createRes.ok && createData.result) {
                dsSysId = createData.result.sys_id;
                console.log(`[API Automation] Successfully created Data Source with sys_id: ${dsSysId}`);
            } else {
                console.log(`[API Automation] ERROR creating Data Source: ${JSON.stringify(createData)}`);
            }
        }

        // --- 2. Handle Storage Server CI (Create or Verify) ---
        const storageServerTable = 'cmdb_ci_storage_server';
        console.log(`[API Automation] Checking if Storage Server exists: "${storageServerName}"`);
        const serverGetRes = await fetch(`/api/now/table/${storageServerTable}?sysparm_query=name=${encodeURIComponent(storageServerName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const serverGetData = await serverGetRes.json();
        let serverSysId = '';

        if (serverGetData.result && serverGetData.result.length > 0) {
            serverSysId = serverGetData.result[0].sys_id;
            console.log(`[API Automation] Storage Server already exists with sys_id: ${serverSysId}`);
        } else {
            console.log(`[API Automation] Storage Server not found. Creating new record...`);
            const serverCreateRes = await fetch(`/api/now/table/${storageServerTable}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ name: storageServerName })
            });
            const serverCreateData = await serverCreateRes.json();
            if (serverCreateRes.ok && serverCreateData.result) {
                serverSysId = serverCreateData.result.sys_id;
                console.log(`[API Automation] Successfully created Storage Server with sys_id: ${serverSysId}`);
            } else {
                console.log(`[API Automation] ERROR creating Storage Server: ${JSON.stringify(serverCreateData)}`);
            }
        }

        // --- 3. Handle Relationship CI (`cmdb_rel_ci`) and enforce 'Provided by::Provides' type ---
        if (dsSysId && serverSysId) {
            console.log(`[API Automation] Looking up relationship type 'Provided by::Provides'...`);
            const typeRes = await fetch(`/api/now/table/cmdb_rel_type?sysparm_query=name=Provided by::Provides&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const typeData = await typeRes.json();
            let relTypeSysId = typeData.result && typeData.result.length > 0 ? typeData.result[0].sys_id : '';
            console.log(`[API Automation] Relationship type sys_id for 'Provided by::Provides': ${relTypeSysId || 'Not found'}`);

            // Check if *any* relationship exists between these two CIs regardless of type
            console.log(`[API Automation] Checking existing relationship between parent=${dsSysId} and child=${serverSysId}...`);
            const relCheckRes = await fetch(`/api/now/table/cmdb_rel_ci?sysparm_query=parent=${dsSysId}^child=${serverSysId}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const relCheckData = await relCheckRes.json();

            if (relCheckData.result && relCheckData.result.length > 0) {
                const existingRel = relCheckData.result[0];
                if (relTypeSysId && existingRel.type !== relTypeSysId) {
                    console.log(`[API Automation] Relationship exists but has incorrect type. Updating to 'Provided by::Provides'...`);
                    await fetch(`/api/now/table/cmdb_rel_ci/${existingRel.sys_id}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers,
                        body: JSON.stringify({ type: relTypeSysId })
                    });
                } else {
                    console.log(`[API Automation] Correct 'Provided by::Provides' relationship already exists in cmdb_rel_ci — skipping.`);
                }
            } else {
                console.log(`[API Automation] Creating relationship in cmdb_rel_ci with 'Provided by::Provides' type...`);
                const relPayload = { parent: dsSysId, child: serverSysId };
                if (relTypeSysId) relPayload.type = relTypeSysId;

                const relCreateRes = await fetch(`/api/now/table/cmdb_rel_ci`, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(relPayload)
                });

                if (relCreateRes.ok) {
                    console.log(`[API Automation] Successfully created relationship in cmdb_rel_ci.`);
                } else {
                    const errBody = await relCreateRes.text();
                    console.log(`[API Automation] ERROR creating relationship: ${errBody}`);
                }
            }
        } else {
            console.log(`[API Automation] Skipping relationship creation due to missing parent or child sys_id.`);
        }
    }, { tableName, dataSourceName, storageServerName, storageTypeInput, fileShareKeyword });

    await page.waitForTimeout(2_000);

    // --- 4. Configure Properties in BigID Setup ---
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.waitForTimeout(3_000);
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForTimeout(2_000);

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click();
    await guidedSetupFrame.getByRole('link', { name: 'Task completed Configure Properties' }).click();
    await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Configure Properties' }).click();
    await page.waitForTimeout(2_000);

    // Populate Export Data Sources list using nth(3)
    const exportField = guidedSetupFrame.getByRole('textbox').nth(3);
    await exportField.waitFor({ state: 'visible', timeout: 30_000 });
    await exportField.click();
    await exportField.press('ControlOrMeta+a');
    await exportField.fill(dataSourceName);
    console.log(`[UI Automation] Populated Export Data Sources list with: ${dataSourceName}`);

    // Handle the Toggle and Dynamic Keyword Field based on storage type
    if (storageTypeInput === 'smb') {
        const useDefaultSmbCheckbox = guidedSetupFrame.locator('#use_default_smb_n');
        await useDefaultSmbCheckbox.waitFor({ state: 'visible', timeout: 60_000 });
        await useDefaultSmbCheckbox.check();

        const keywordField = guidedSetupFrame
            .getByText('Provide keyword to identify SMB Datasource record', { exact: true })
            .locator('xpath=..')
            .getByRole('textbox');

        await keywordField.waitFor({ state: 'visible', timeout: 60_000 });
        await keywordField.fill(fileShareKeyword);
        console.log(`[UI Automation] Populated SMB File Share Keyword with: ${fileShareKeyword}`);
    } else {
        const useDefaultNfsCheckbox = guidedSetupFrame.locator('#use_default_nfs_config_n');
        await useDefaultNfsCheckbox.waitFor({ state: 'visible', timeout: 60_000 });
        await useDefaultNfsCheckbox.check();

        const keywordField = guidedSetupFrame
            .getByText('Provide keyword to identify NFS Datasource record', { exact: true })
            .locator('xpath=..')
            .getByRole('textbox');

        await keywordField.waitFor({ state: 'visible', timeout: 60_000 });
        await keywordField.fill(fileShareKeyword);
        console.log(`[UI Automation] Populated NFS File Share Keyword with: ${fileShareKeyword}`);
    }

    await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
    await page.waitForTimeout(2_000);
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    // --- 5. Run the Export Scheduled Job ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForTimeout(2_000);

    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure the Scheduled Job to Export Data Sources' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure the Scheduled Job to Export Data Sources' })
        .click();
    await guidedSetupFrame.getByRole('link', { name: 'Task in progress Export' }).click();
    await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure' }).click();

    await page.goto(`${snUrl}/now/nav/ui/classic/params/target/sysauto_script.do%3Fsys_id%3D90fdf7e99395421047d3b0a08bba108f`);
    await page.waitForTimeout(2_000);
    await guidedSetupFrame.locator('#execute_bottom').click();

    await page.waitForTimeout(10_000);

    // --- 6. Navigate to Logs and Assert Final Message ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('em logs');
    await page.getByRole('link', { name: 'All 1 of' }).click();
    await page.waitForTimeout(2_000);

    const failureLog = guidedSetupFrame.getByText(/Failed to (Create|Update) Data Source/i).first();
    const failureFound = await failureLog.isVisible({ timeout: 10_000 }).catch(() => false);

    if (failureFound) {
        const failureText = await failureLog.innerText().catch(() => '(could not read failure text)');
        expect(failureFound, `Export failed: "${failureText}"`).toBeFalsy();
    }

    const [createdVisible, updatedVisible, existingLogVisible] = await Promise.all([
        guidedSetupFrame.getByText(/Created Data Source:/i).first().isVisible({ timeout: 30_000 }).catch(() => false),
        guidedSetupFrame.getByText(/Updated Data Source:/i).first().isVisible({ timeout: 5_000 }).catch(() => false),
        guidedSetupFrame
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