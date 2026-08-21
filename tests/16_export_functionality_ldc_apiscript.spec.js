import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import 'dotenv/config';

// 1. Read and parse the Master CSV file at startup
const csvFilePath = path.join(__dirname, '../test-data/dataSource.csv');
const allRecords = parse(fs.readFileSync(csvFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
});

// 2. FILTER records for Script 16
const records = allRecords.filter(row => row.SCRIPT_NO === '16');

// 3. Loop through each row and register tests dynamically at the top level
for (const row of records) {
test('Logical Datacenter export workflow via API', async ({ page }) => {
    test.setTimeout(480_000);

    const snUrl = process.env.SN_URL;
    const dataSourceName = row.EXPORT_LDC_DATASOURCE;         // e.g. dev69420_s3_host
    const logicalDatacenterName = row.EXPORT_LDC_DATACENTER;  // e.g. dev69420_ldc
    const tableName = row.EXPORT_LDC_CI_CLASS;                // e.g. cmdb_ci_aws_s3_endpoint
    const storageType = row.EXPORT_STORAGE_TYPE || (tableName === 'cmdb_ci_file_system_smb' ? 'smb_v2' : 'nfs_v2');

    const expectedLogExisting = 'Service Graph Connector for BigID: BigIDSyncDSFunctions -> exportDataSource -> Finished Exporting Data Sources : Exported [0] and Updated [1]';

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    // Forward browser console logs containing '[API Automation]' directly to your terminal
    page.on('console', msg => {
        if (msg.text().includes('[API Automation]')) {
            console.log(msg.text());
        }
    });

    // --- 1, 2 & 3. Pure API-Driven Data Setup, Datacenter Creation, and Relationship Mapping ---
    console.log(`Starting API-driven CMDB setup for class: ${tableName}`);

    await page.evaluate(async ({ tableName, dataSourceName, logicalDatacenterName, storageType }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        console.log(`[API Automation] Session Token found: ${token ? 'YES (' + token.substring(0, 5) + '...)' : 'NO'}`);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        // --- 1. Handle Data Source CI (Create or Update) ---
        const isS3 = tableName === 'cmdb_ci_aws_s3_endpoint';
        const queryField = isS3 ? 'host' : 'name';
        
        console.log(`[API Automation] Checking if Data Source exists on table "${tableName}" where ${queryField} = "${dataSourceName}"`);
        const dsGetRes = await fetch(`/api/now/table/${tableName}?sysparm_query=${queryField}=${encodeURIComponent(dataSourceName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const dsGetData = await dsGetRes.json();
        let dsSysId = '';

        const dsPayload = isS3 
            ? { name: dataSourceName, host: dataSourceName, type: 's3-v2' }
            : { name: dataSourceName, storage_type: storageType };

        if (dsGetData.result && dsGetData.result.length > 0) {
            dsSysId = dsGetData.result[0].sys_id;
            console.log(`[API Automation] Data Source already exists with sys_id: ${dsSysId}. Updating fields...`);
            
            const updateRes = await fetch(`/api/now/table/${tableName}/${dsSysId}`, {
                method: 'PUT',
                credentials: 'include',
                headers,
                body: JSON.stringify(dsPayload)
            });
            console.log(`[API Automation] Data Source Update Status: ${updateRes.status}`);
        } else {
            console.log(`[API Automation] Data Source not found. Creating new record...`);
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

        // --- 2. Handle Logical Datacenter CI (Create or Verify) ---
        const ldcTable = 'cmdb_ci_logical_datacenter';
        console.log(`[API Automation] Checking if Logical Datacenter exists: "${logicalDatacenterName}"`);
        const ldcGetRes = await fetch(`/api/now/table/${ldcTable}?sysparm_query=name=${encodeURIComponent(logicalDatacenterName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const ldcGetData = await ldcGetRes.json();
        let ldcSysId = '';

        if (ldcGetData.result && ldcGetData.result.length > 0) {
            ldcSysId = ldcGetData.result[0].sys_id;
            console.log(`[API Automation] Logical Datacenter already exists with sys_id: ${ldcSysId}`);
        } else {
            console.log(`[API Automation] Logical Datacenter not found. Creating new record...`);
            const ldcCreateRes = await fetch(`/api/now/table/${ldcTable}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ name: logicalDatacenterName })
            });
            const ldcCreateData = await ldcCreateRes.json();
            if (ldcCreateRes.ok && ldcCreateData.result) {
                ldcSysId = ldcCreateData.result.sys_id;
                console.log(`[API Automation] Successfully created Logical Datacenter with sys_id: ${ldcSysId}`);
            } else {
                console.log(`[API Automation] ERROR creating Logical Datacenter: ${JSON.stringify(ldcCreateData)}`);
            }
        }

        // --- 3. Handle Relationship CI (`cmdb_rel_ci`) ---
        if (dsSysId && ldcSysId) {
            console.log(`[API Automation] Looking up relationship type 'Hosted on::Hosts'...`);
            const typeRes = await fetch(`/api/now/table/cmdb_rel_type?sysparm_query=name=Hosted on::Hosts&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const typeData = await typeRes.json();
            let relTypeSysId = typeData.result && typeData.result.length > 0 ? typeData.result[0].sys_id : '';
            console.log(`[API Automation] Relationship type sys_id: ${relTypeSysId || 'Not found (will use default)'}`);

            console.log(`[API Automation] Checking if relationship exists between parent=${dsSysId} and child=${ldcSysId}...`);
            let relQuery = `parent=${dsSysId}^child=${ldcSysId}`;
            if (relTypeSysId) relQuery += `^type=${relTypeSysId}`;

            const relCheckRes = await fetch(`/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(relQuery)}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const relCheckData = await relCheckRes.json();

            if (relCheckData.result && relCheckData.result.length > 0) {
                console.log(`[API Automation] Relationship already exists in cmdb_rel_ci — skipping.`);
            } else {
                console.log(`[API Automation] Creating relationship in cmdb_rel_ci...`);
                const relPayload = { parent: dsSysId, child: ldcSysId };
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
    }, { tableName, dataSourceName, logicalDatacenterName, storageType });

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

    const gsftMain = page.locator('iframe[name="gsft_main"]').contentFrame();
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
}