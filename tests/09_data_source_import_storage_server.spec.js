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

// 2. FILTER records for Script 09
const records = allRecords.filter(row => row.SCRIPT_NO === '09');

// 3. Loop through each row and register tests dynamically at the top level
for (const row of records) {

test('Storage File Share import with storage server prerequisite & direct table verification', async ({ page }) => {
    test.setTimeout(180_000);

    const snUrl = process.env.SN_URL;
    const storageFileshareDataSource = row.IMPORT_JOB_SS_DATASOURCE;
    const storageServerName = row.IMPORT_JOB_SS;
    const storageTypeInput = (row.IMPORT_JOB_SS_TYPE || 'SMB').toLowerCase();
    const serverIpOrHost = row.IMPORT_JOB_SS_IP_ADDRESS;

    // Generate a random keyword for file share identification
    const randomKeyword = `kw_${Math.random().toString(36).substring(2, 8)}`;
    const fileShareKeyword = row.EXPORT_FILESHARE_KEYWORD || randomKeyword;

    const targetTableName = 'cmdb_ci_storage_fileshare';

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    page.on('console', msg => {
        if (msg.text().includes('[API Automation]')) {
            console.log(msg.text());
        }
    });

    console.log(`Starting API setup for Storage Server: ${storageServerName}, Input Value: ${serverIpOrHost}, Type: ${storageTypeInput}`);

    // --- 1. Automatic Storage Server Creation with IP vs Hostname Validation via API ---
    if (storageServerName) {
        await page.evaluate(async ({ serverName, inputVal }) => {
            const token = window.g_ck || (window.top && window.top.g_ck) || '';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserToken': token
            };

            // Regex to check if the input value is a valid IPv4 address
            const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            const isIpAddress = ipRegex.test(inputVal);

            console.log(`[API Automation] Storage Server input "${inputVal}" is an IP address? ${isIpAddress}`);

            const storageServerTable = 'cmdb_ci_storage_server';
            console.log(`[API Automation] Checking if Storage Server CI exists: "${serverName}"`);
            
            const getRes = await fetch(`/api/now/table/${storageServerTable}?sysparm_query=name=${encodeURIComponent(serverName)}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const getData = await getRes.json();

            // Dynamically assign to 'ip_address' or 'host_name' column based on check
            const serverPayload = { name: serverName };
            if (isIpAddress) {
                serverPayload.ip_address = inputVal;
            } else {
                serverPayload.host_name = inputVal;
            }

            if (getData.result && getData.result.length > 0) {
                console.log(`[API Automation] Storage Server CI already exists with sys_id: ${getData.result[0].sys_id}`);
            } else {
                console.log(`[API Automation] Storage Server not found. Creating new record with payload:`, serverPayload);
                
                const createRes = await fetch(`/api/now/table/${storageServerTable}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(serverPayload)
                });
                const createData = await createRes.json();
                if (createRes.ok && createData.result) {
                    console.log(`[API Automation] Successfully created Storage Server CI with sys_id: ${createData.result.sys_id}`);
                } else {
                    console.log(`[API Automation] ERROR creating Storage Server CI: ${JSON.stringify(createData)}`);
                }
            }
        }, { serverName: storageServerName, inputVal: serverIpOrHost });
    }

    // --- 2. Configure BigID Setup Properties via UI (Toggle to No) ---
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    await page.getByRole('menuitem', { name: 'All' }).click();
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

    // Set Import Data Sources
    const importDataSourcesField = guidedSetupFrame.getByRole('textbox').nth(2);
    await importDataSourcesField.waitFor({ state: 'visible', timeout: 60_000 });
    await importDataSourcesField.click();
    await importDataSourcesField.press('ControlOrMeta+a');
    await importDataSourcesField.fill(storageFileshareDataSource);

    // Toggle to "No" depending on storage type, then fill the keyword field
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
    }

    await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    // --- 3. Run the import job ---
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

    console.log('Waiting for import job to complete...');
    await page.waitForTimeout(30_000);

    // --- 4. Direct Table Verification via API for cmdb_ci_storage_fileshare ---
    console.log(`[API Automation] Verifying creation of record "${storageFileshareDataSource}" on table "${targetTableName}"...`);
    
    const recordCreated = await page.evaluate(async ({ tableName, recordName }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        const res = await fetch(`/api/now/table/${tableName}?sysparm_query=name=${encodeURIComponent(recordName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        
        const data = await res.json();
        if (data.result && data.result.length > 0) {
            console.log(`[API Automation] Found storage fileshare record! sys_id: ${data.result[0].sys_id}`);
            return true;
        }
        
        console.log(`[API Automation] Storage fileshare record not found via API.`);
        return false;
    }, { tableName: targetTableName, recordName: storageFileshareDataSource });

    expect(recordCreated, `The storage fileshare record "${storageFileshareDataSource}" was not found in the "${targetTableName}" table`).toBeTruthy();
});
}



// import { test, expect } from '@playwright/test';
// import 'dotenv/config';

// test('TC-023: Storage File Share import with storage server prerequisite & direct table verification', async ({ page }) => {
//     test.setTimeout(180_000);

//     const snUrl = process.env.SN_URL;
//     const storageFileshareDataSource = process.env.IMPORT_JOB_SS_DATASOURCE || process.env.STORAGE_FILESHARE_DATA_SOURCE;
//     const storageServerName = process.env.IMPORT_JOB_SS || process.env.STORAGE_FILESHARE_SERVER;
//     const storageTypeInput = (process.env.IMPORT_JOB_SS_TYPE || 'SMB').toLowerCase();
//     const serverIpOrHost = process.env.IMPORT_JOB_SS_IP_ADDRESS || '192.168.1.100';
    
//     // Generate a random keyword for file share identification
//     const randomKeyword = `kw_${Math.random().toString(36).substring(2, 8)}`;
//     const fileShareKeyword = process.env.EXPORT_FILESHARE_KEYWORD || randomKeyword;

//     const targetTableName = 'cmdb_ci_storage_fileshare';

//     await page.goto(snUrl);
//     await page.waitForTimeout(3_000);

//     page.on('console', msg => {
//         if (msg.text().includes('[API Automation]')) {
//             console.log(msg.text());
//         }
//     });

//     console.log(`Starting API setup for Storage Server: ${storageServerName}, Input Value: ${serverIpOrHost}, Type: ${storageTypeInput}`);

//     // --- 1. Automatic Storage Server Creation with IP vs Hostname Validation via API ---
//     if (storageServerName) {
//         await page.evaluate(async ({ serverName, inputVal }) => {
//             const token = window.g_ck || (window.top && window.top.g_ck) || '';
//             const headers = {
//                 'Content-Type': 'application/json',
//                 'Accept': 'application/json',
//                 'X-UserToken': token
//             };

//             // Regex to check if the input value is a valid IPv4 address
//             const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
//             const isIpAddress = ipRegex.test(inputVal);

//             console.log(`[API Automation] Storage Server input "${inputVal}" is an IP address? ${isIpAddress}`);

//             const storageServerTable = 'cmdb_ci_storage_server';
//             console.log(`[API Automation] Checking if Storage Server CI exists: "${serverName}"`);
            
//             const getRes = await fetch(`/api/now/table/${storageServerTable}?sysparm_query=name=${encodeURIComponent(serverName)}&sysparm_limit=1`, {
//                 method: 'GET',
//                 credentials: 'include',
//                 headers
//             });
//             const getData = await getRes.json();

//             // Dynamically assign to 'ip_address' or 'host_name' column based on check
//             const serverPayload = { name: serverName };
//             if (isIpAddress) {
//                 serverPayload.ip_address = inputVal;
//             } else {
//                 serverPayload.host_name = inputVal;
//             }

//             if (getData.result && getData.result.length > 0) {
//                 console.log(`[API Automation] Storage Server CI already exists with sys_id: ${getData.result[0].sys_id}`);
//             } else {
//                 console.log(`[API Automation] Storage Server not found. Creating new record with payload:`, serverPayload);
                
//                 const createRes = await fetch(`/api/now/table/${storageServerTable}`, {
//                     method: 'POST',
//                     credentials: 'include',
//                     headers,
//                     body: JSON.stringify(serverPayload)
//                 });
//                 const createData = await createRes.json();
//                 if (createRes.ok && createData.result) {
//                     console.log(`[API Automation] Successfully created Storage Server CI with sys_id: ${createData.result.sys_id}`);
//                 } else {
//                     console.log(`[API Automation] ERROR creating Storage Server CI: ${JSON.stringify(createData)}`);
//                 }
//             }
//         }, { serverName: storageServerName, inputVal: serverIpOrHost });
//     }

//     // --- 2. Configure BigID Setup Properties via UI (Toggle to No) ---
//     const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
//     await page.getByRole('menuitem', { name: 'All' }).click();
//     if (await clearFilterButton.isVisible().catch(() => false)) {
//         await clearFilterButton.click();
//     }

//     await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
//     await page.getByRole('link', { name: 'Setup 1 of' }).click();

//     const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//         .waitFor({ state: 'attached', timeout: 60_000 });
//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//         .click();

//     await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
//     await guidedSetupFrame
//         .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
//         .click();

//     // Set Import Data Sources
//     const importDataSourcesField = guidedSetupFrame.getByRole('textbox').nth(2);
//     await importDataSourcesField.waitFor({ state: 'visible', timeout: 60_000 });
//     await importDataSourcesField.click();
//     await importDataSourcesField.press('ControlOrMeta+a');
//     await importDataSourcesField.fill(storageFileshareDataSource);

//     // Toggle to "No" depending on storage type, then fill the keyword field
//     if (storageTypeInput === 'smb') {
//         const useDefaultSmbCheckbox = guidedSetupFrame.locator('#use_default_smb_n');
//         await useDefaultSmbCheckbox.waitFor({ state: 'visible', timeout: 60_000 });
//         await useDefaultSmbCheckbox.check();

//         const keywordField = guidedSetupFrame
//             .getByText('Provide keyword to identify SMB Datasource record', { exact: true })
//             .locator('xpath=..')
//             .getByRole('textbox');

//         await keywordField.waitFor({ state: 'visible', timeout: 60_000 });
//         await keywordField.fill(fileShareKeyword);
//     } else {
//         const useDefaultNfsCheckbox = guidedSetupFrame.locator('#use_default_nfs_config_n');
//         await useDefaultNfsCheckbox.waitFor({ state: 'visible', timeout: 60_000 });
//         await useDefaultNfsCheckbox.check();

//         const keywordField = guidedSetupFrame
//             .getByText('Provide keyword to identify NFS Datasource record', { exact: true })
//             .locator('xpath=..')
//             .getByRole('textbox');

//         await keywordField.waitFor({ state: 'visible', timeout: 60_000 });
//         await keywordField.fill(fileShareKeyword);
//     }

//     await guidedSetupFrame.getByRole('button', { name: 'Save and Validate' }).nth(1).click();
//     await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

//     // --- 3. Run the import job ---
//     await page.getByRole('menuitem', { name: 'All' }).click();
//     await page.getByRole('link', { name: 'Setup 1 of' }).click();

//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Set' })
//         .waitFor({ state: 'attached', timeout: 60_000 });
//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Set' })
//         .click();

//     await guidedSetupFrame
//         .getByRole('link', { name: ' Task in progress Import Data Sources' })
//         .click();
//     await guidedSetupFrame
//         .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
//         .click();
//     await guidedSetupFrame.locator('#execute_bottom').click();

//     console.log('Waiting for import job to complete...');
//     await page.waitForTimeout(30_000);

//     // --- 4. Direct Table Verification via API for cmdb_ci_storage_fileshare ---
//     console.log(`[API Automation] Verifying creation of record "${storageFileshareDataSource}" on table "${targetTableName}"...`);
    
//     const recordCreated = await page.evaluate(async ({ tableName, recordName }) => {
//         const token = window.g_ck || (window.top && window.top.g_ck) || '';
//         const headers = {
//             'Content-Type': 'application/json',
//             'Accept': 'application/json',
//             'X-UserToken': token
//         };

//         const res = await fetch(`/api/now/table/${tableName}?sysparm_query=name=${encodeURIComponent(recordName)}&sysparm_limit=1`, {
//             method: 'GET',
//             credentials: 'include',
//             headers
//         });
        
//         const data = await res.json();
//         if (data.result && data.result.length > 0) {
//             console.log(`[API Automation] Found storage fileshare record! sys_id: ${data.result[0].sys_id}`);
//             return true;
//         }
        
//         console.log(`[API Automation] Storage fileshare record not found via API.`);
//         return false;
//     }, { tableName: targetTableName, recordName: storageFileshareDataSource });

//     expect(recordCreated, `The storage fileshare record "${storageFileshareDataSource}" was not found in the "${targetTableName}" table`).toBeTruthy();
// });