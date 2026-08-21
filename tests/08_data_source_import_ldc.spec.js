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

// 2. FILTER records for Script 08
const records = allRecords.filter(row => row.SCRIPT_NO === '08');

// 3. Loop through each row and register tests dynamically at the top level
for (const row of records) {
    test(`TC-08: API-Driven Datacenter Creation with IP/DNS Validation & Dynamic Verification (${row.IMPORT_JOB_LDC_DATASOURCE})`, async ({ page }) => {
        test.setTimeout(300_000);

        const snUrl = process.env.SN_URL;
        const testAssetName = row.IMPORT_JOB_LDC_DATASOURCE;   // e.g., SMB/NFS Share Source
        const testAssetServer = row.IMPORT_JOB_LDC;            // e.g., SMB/NFS Logical Datacenter
        const ldcType = row.IMPORT_JOB_LDC_TYPE;               // e.g., SMB, NFS, S3
        const ldcDnsDomain = row.IMPORT_JOB_LDC_DNS_DOMAIN;    // Can be a DNS name OR an IP address

        const supportedCloudTypes = [
            'S3',
            'S3-V2',
            'DYNAMODB',
            'REDSHIFT',
            'SMB',
            'NFS'
        ];

        const dbTableMapping = {
            'S3': 'cmdb_ci_aws_s3_endpoint',
            'S3-V2': 'cmdb_ci_aws_s3_endpoint',
            'DYNAMODB': 'cmdb_ci_dynamodb_table',
            'REDSHIFT': 'cmdb_ci_aws_redshift',
            'SMB': 'cmdb_ci_file_system_smb',
            'NFS': 'cmdb_ci_file_system_nfs'
        };

        const upperLdcType = (ldcType || '').toUpperCase();
        const targetTableName = dbTableMapping[upperLdcType] || 'cmdb_ci_cloud_database_instance';
        console.log(`[Automation] Resolved target table for type ${ldcType}: ${targetTableName}`);

        await page.goto(snUrl);
        await page.waitForTimeout(3_000);

        page.on('console', msg => {
            if (msg.text().includes('[API Automation]')) {
                console.log(msg.text());
            }
        });

        console.log(`Starting API setup for Type: ${ldcType}, Logical Datacenter: ${testAssetServer}, Input Value: ${ldcDnsDomain}`);

        // --- 1. Automatic Logical Datacenter Creation with IP vs DNS Check via API ---
        const shouldCreateDatacenter = supportedCloudTypes.includes(upperLdcType);

        if (shouldCreateDatacenter && testAssetServer) {
            await page.evaluate(async ({ datacenterName, inputVal, dbTypeVal }) => {
                const token = window.g_ck || (window.top && window.top.g_ck) || '';
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-UserToken': token
                };

                const upperType = (dbTypeVal || '').toUpperCase();

                // Regex to check if the input value is a valid IPv4 address
                const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

                let payloadValue = inputVal;
                let isIpAddress = false;

                if (upperType.includes('S3')) {
                    payloadValue = inputVal || (datacenterName.includes('v2') ? 'bigid-s3-v2.aws.com' : 'bigid-s3.aws.com');
                } else if (upperType.includes('DYNAMODB')) {
                    payloadValue = inputVal || 'bigid-dynamodb.aws.com';
                } else if (upperType.includes('REDSHIFT')) {
                    payloadValue = inputVal || datacenterName;
                } else if (upperType === 'SMB' || upperType === 'NFS') {
                    isIpAddress = ipRegex.test(inputVal);
                    console.log(`[API Automation] SMB/NFS input "${inputVal}" is an IP address? ${isIpAddress}`);
                }

                const datacenterClass = 'cmdb_ci_logical_datacenter';
                console.log(`[API Automation] Checking if Logical Datacenter CI exists: "${datacenterName}"`);

                const getRes = await fetch(`/api/now/table/${datacenterClass}?sysparm_query=name=${encodeURIComponent(datacenterName)}&sysparm_limit=1`, {
                    method: 'GET',
                    credentials: 'include',
                    headers
                });
                const getData = await getRes.json();

                // Dynamically assign to 'ip_address' or 'dns_domain' column based on check
                const datacenterPayload = { name: datacenterName };
                if (isIpAddress) {
                    datacenterPayload.ip_address = payloadValue;
                } else {
                    datacenterPayload.dns_domain = payloadValue;
                }

                if (getData.result && getData.result.length > 0) {
                    console.log(`[API Automation] Logical Datacenter CI already exists with sys_id: ${getData.result[0].sys_id}`);
                } else {
                    console.log(`[API Automation] Logical Datacenter not found. Creating new record with payload:`, datacenterPayload);

                    const createRes = await fetch(`/api/now/table/${datacenterClass}`, {
                        method: 'POST',
                        credentials: 'include',
                        headers,
                        body: JSON.stringify(datacenterPayload)
                    });
                    const createData = await createRes.json();
                    if (createRes.ok && createData.result) {
                        console.log(`[API Automation] Successfully created Logical Datacenter CI with sys_id: ${createData.result.sys_id}`);
                    } else {
                        console.log(`[API Automation] ERROR creating Logical Datacenter CI: ${JSON.stringify(createData)}`);
                    }
                }
            }, { datacenterName: testAssetServer, inputVal: ldcDnsDomain, dbTypeVal: ldcType });
        }

        const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
        const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

        // --- 2. Configure BigID Setup Properties via UI ---
        await page.getByRole('menuitem', { name: 'All' }).click();
        if (await clearFilterButton.isVisible().catch(() => false)) {
            await clearFilterButton.click();
        }
        await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
        await page.getByRole('link', { name: 'Setup 1 of' }).click();
        await page.waitForTimeout(2_000);

        await guidedSetupFrame
            .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
            .click();

        await guidedSetupFrame
            .getByRole('link', { name: ' Task completed Configure Properties' })
            .click();

        await guidedSetupFrame
            .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
            .click();

        await guidedSetupFrame.getByRole('textbox').nth(2).fill(testAssetName);

        // Toggle Yes for SMB or NFS Configuration forms respectively
        if (upperLdcType === 'SMB') {
            const useDefaultSmbYesCheckbox = guidedSetupFrame.locator('#use_default_smb_y');
            await useDefaultSmbYesCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
            await useDefaultSmbYesCheckbox.check();
            console.log('[UI Automation] Toggled SMB Default configuration to Yes.');
        } else if (upperLdcType === 'NFS') {
            const useDefaultNfsYesCheckbox = guidedSetupFrame.locator('#use_default_nfs_config_y');
            await useDefaultNfsYesCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
            await useDefaultNfsYesCheckbox.check();
            console.log('[UI Automation] Toggled NFS Default configuration to Yes.');
        }

        await guidedSetupFrame
            .getByRole('toolbar')
            .getByRole('button', { name: 'Save and Validate' })
            .click();

        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
        await page.goBack();

        const guidedSetupFrameAfterSave = page.locator('iframe[name="gsft_main"]').contentFrame();

        // --- 3. Execute Import Job ---
        await guidedSetupFrameAfterSave
            .getByRole('button', { name: 'Select chain item to goto Set' })
            .click();

        await guidedSetupFrameAfterSave
            .getByRole('link', { name: ' Task in progress Import Data Sources' })
            .click();

        await guidedSetupFrameAfterSave
            .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
            .click();

        await guidedSetupFrameAfterSave.locator('#execute_bottom').click();

        console.log('Waiting for import job to complete...');
        await page.waitForTimeout(30_000);

        // --- 4. Verify Instance Creation via Table API ---
        console.log(`[API Automation] Verifying creation of instance record "${testAssetName}" on table "${targetTableName}"...`);

        const instanceCreated = await page.evaluate(async ({ tableName, instanceName }) => {
            const token = window.g_ck || (window.top && window.top.g_ck) || '';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserToken': token
            };

            const res = await fetch(`/api/now/table/${tableName}?sysparm_query=name=${encodeURIComponent(instanceName)}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });

            const data = await res.json();
            if (data.result && data.result.length > 0) {
                console.log(`[API Automation] Found instance record! sys_id: ${data.result[0].sys_id}`);
                return true;
            }

            console.log(`[API Automation] Instance record not found via API.`);
            return false;
        }, { tableName: targetTableName, instanceName: testAssetName });

        expect(instanceCreated, `The instance record "${testAssetName}" was not found in the "${targetTableName}" table`).toBeTruthy();
    });
}




// import { test, expect } from '@playwright/test';
// import 'dotenv/config';

// test('TC-010 - API-Driven Datacenter Creation with IP/DNS Validation & Dynamic Verification', async ({ page }) => {
//     test.setTimeout(300_000);

//     const snUrl = process.env.SN_URL;
//     const testAssetName = process.env.IMPORT_JOB_LDC_DATASOURCE;   // e.g., SMB/NFS Share Source
//     const testAssetServer = process.env.IMPORT_JOB_LDC;            // e.g., SMB/NFS Logical Datacenter
//     const ldcType = process.env.IMPORT_JOB_LDC_TYPE;               // e.g., SMB, NFS, S3
//     const ldcDnsDomain = process.env.IMPORT_JOB_LDC_DNS_DOMAIN;    // Can be a DNS name OR an IP address

//     const supportedCloudTypes = [
//         'S3',
//         'S3-V2',
//         'DYNAMODB',
//         'REDSHIFT',
//         'SMB',
//         'NFS'
//     ];

//     const dbTableMapping = {
//         'S3': 'cmdb_ci_aws_s3_endpoint', 
//         'S3-V2': 'cmdb_ci_aws_s3_endpoint',
//         'DYNAMODB': 'cmdb_ci_dynamodb_table',
//         'REDSHIFT': 'cmdb_ci_aws_redshift',
//         'SMB': 'cmdb_ci_file_system_smb',
//         'NFS': 'cmdb_ci_file_system_nfs'
//     };

//     const upperLdcType = (ldcType || '').toUpperCase();
//     const targetTableName = dbTableMapping[upperLdcType] || 'cmdb_ci_cloud_database_instance';
//     console.log(`[Automation] Resolved target table for type ${ldcType}: ${targetTableName}`);

//     await page.goto(snUrl);
//     await page.waitForTimeout(3_000);

//     page.on('console', msg => {
//         if (msg.text().includes('[API Automation]')) {
//             console.log(msg.text());
//         }
//     });

//     console.log(`Starting API setup for Type: ${ldcType}, Logical Datacenter: ${testAssetServer}, Input Value: ${ldcDnsDomain}`);

//     // --- 1. Automatic Logical Datacenter Creation with IP vs DNS Check via API ---
//     const shouldCreateDatacenter = supportedCloudTypes.includes(upperLdcType);

//     if (shouldCreateDatacenter && testAssetServer) {
//         await page.evaluate(async ({ datacenterName, inputVal, dbTypeVal }) => {
//             const token = window.g_ck || (window.top && window.top.g_ck) || '';
//             const headers = {
//                 'Content-Type': 'application/json',
//                 'Accept': 'application/json',
//                 'X-UserToken': token
//             };

//             const upperType = (dbTypeVal || '').toUpperCase();
            
//             // Regex to check if the input value is a valid IPv4 address
//             const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            
//             let payloadValue = inputVal;
//             let isIpAddress = false;

//             if (upperType.includes('S3')) {
//                 payloadValue = inputVal || (datacenterName.includes('v2') ? 'bigid-s3-v2.aws.com' : 'bigid-s3.aws.com');
//             } else if (upperType.includes('DYNAMODB')) {
//                 payloadValue = inputVal || 'bigid-dynamodb.aws.com';
//             } else if (upperType.includes('REDSHIFT')) {
//                 payloadValue = inputVal || datacenterName;
//             } else if (upperType === 'SMB' || upperType === 'NFS') {
//                 isIpAddress = ipRegex.test(inputVal);
//                 console.log(`[API Automation] SMB/NFS input "${inputVal}" is an IP address? ${isIpAddress}`);
//             }

//             const datacenterClass = 'cmdb_ci_logical_datacenter';
//             console.log(`[API Automation] Checking if Logical Datacenter CI exists: "${datacenterName}"`);
            
//             const getRes = await fetch(`/api/now/table/${datacenterClass}?sysparm_query=name=${encodeURIComponent(datacenterName)}&sysparm_limit=1`, {
//                 method: 'GET',
//                 credentials: 'include',
//                 headers
//             });
//             const getData = await getRes.json();

//             // Dynamically assign to 'ip_address' or 'dns_domain' column based on check
//             const datacenterPayload = { name: datacenterName };
//             if (isIpAddress) {
//                 datacenterPayload.ip_address = payloadValue;
//             } else {
//                 datacenterPayload.dns_domain = payloadValue;
//             }

//             if (getData.result && getData.result.length > 0) {
//                 console.log(`[API Automation] Logical Datacenter CI already exists with sys_id: ${getData.result[0].sys_id}`);
//             } else {
//                 console.log(`[API Automation] Logical Datacenter not found. Creating new record with payload:`, datacenterPayload);
                
//                 const createRes = await fetch(`/api/now/table/${datacenterClass}`, {
//                     method: 'POST',
//                     credentials: 'include',
//                     headers,
//                     body: JSON.stringify(datacenterPayload)
//                 });
//                 const createData = await createRes.json();
//                 if (createRes.ok && createData.result) {
//                     console.log(`[API Automation] Successfully created Logical Datacenter CI with sys_id: ${createData.result.sys_id}`);
//                 } else {
//                     console.log(`[API Automation] ERROR creating Logical Datacenter CI: ${JSON.stringify(createData)}`);
//                 }
//             }
//         }, { datacenterName: testAssetServer, inputVal: ldcDnsDomain, dbTypeVal: ldcType });
//     }

//     const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
//     const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

//     // --- 2. Configure BigID Setup Properties via UI ---
//     await page.getByRole('menuitem', { name: 'All' }).click();
//     if (await clearFilterButton.isVisible().catch(() => false)) {
//         await clearFilterButton.click();
//     }
//     await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
//     await page.getByRole('link', { name: 'Setup 1 of' }).click();
//     await page.waitForTimeout(2_000);

//     await guidedSetupFrame
//         .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//         .click();

//     await guidedSetupFrame
//         .getByRole('link', { name: ' Task completed Configure Properties' })
//         .click();

//     await guidedSetupFrame
//         .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
//         .click();

//     await guidedSetupFrame.getByRole('textbox').nth(2).fill(testAssetName);

//     // Toggle Yes for SMB or NFS Configuration forms respectively
//     if (upperLdcType === 'SMB') {
//         const useDefaultSmbYesCheckbox = guidedSetupFrame.locator('#use_default_smb_y');
//         await useDefaultSmbYesCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
//         await useDefaultSmbYesCheckbox.check();
//         console.log('[UI Automation] Toggled SMB Default configuration to Yes.');
//     } else if (upperLdcType === 'NFS') {
//         const useDefaultNfsYesCheckbox = guidedSetupFrame.locator('#use_default_nfs_config_y');
//         await useDefaultNfsYesCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
//         await useDefaultNfsYesCheckbox.check();
//         console.log('[UI Automation] Toggled NFS Default configuration to Yes.');
//     }

//     await guidedSetupFrame
//         .getByRole('toolbar')
//         .getByRole('button', { name: 'Save and Validate' })
//         .click();

//     await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
//     await page.goBack();

//     const guidedSetupFrameAfterSave = page.locator('iframe[name="gsft_main"]').contentFrame();

//     // --- 3. Execute Import Job ---
//     await guidedSetupFrameAfterSave
//         .getByRole('button', { name: 'Select chain item to goto Set' })
//         .click();

//     await guidedSetupFrameAfterSave
//         .getByRole('link', { name: ' Task in progress Import Data Sources' })
//         .click();

//     await guidedSetupFrameAfterSave
//         .getByRole('link', { name: 'Configure Click to configure task Import Data Sources' })
//         .click();

//     await guidedSetupFrameAfterSave.locator('#execute_bottom').click();

//     console.log('Waiting for import job to complete...');
//     await page.waitForTimeout(30_000);

//     // --- 4. Verify Instance Creation via Table API ---
//     console.log(`[API Automation] Verifying creation of instance record "${testAssetName}" on table "${targetTableName}"...`);
    
//     const instanceCreated = await page.evaluate(async ({ tableName, instanceName }) => {
//         const token = window.g_ck || (window.top && window.top.g_ck) || '';
//         const headers = {
//             'Content-Type': 'application/json',
//             'Accept': 'application/json',
//             'X-UserToken': token
//         };

//         const res = await fetch(`/api/now/table/${tableName}?sysparm_query=name=${encodeURIComponent(instanceName)}&sysparm_limit=1`, {
//             method: 'GET',
//             credentials: 'include',
//             headers
//         });
        
//         const data = await res.json();
//         if (data.result && data.result.length > 0) {
//             console.log(`[API Automation] Found instance record! sys_id: ${data.result[0].sys_id}`);
//             return true;
//         }
        
//         console.log(`[API Automation] Instance record not found via API.`);
//         return false;
//     }, { tableName: targetTableName, instanceName: testAssetName });

//     expect(instanceCreated, `The instance record "${testAssetName}" was not found in the "${targetTableName}" table`).toBeTruthy();
// });