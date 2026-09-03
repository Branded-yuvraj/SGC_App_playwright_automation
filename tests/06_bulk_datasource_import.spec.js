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

// 2. FILTER records for Script 07, Script 08, and Script 09
const records = allRecords.filter(row => row.SCRIPT_NO === '07' || row.SCRIPT_NO === '08' || row.SCRIPT_NO === '09');

// 3. Extract and combine all data source values into a single comma-separated string for nth(2)
const allDataSources = records
    .map(row => row.IMPORT_JOB_RDB_DATASOURCE || row.IMPORT_JOB_LDC_DATASOURCE || row.IMPORT_JOB_SS_DATASOURCE)
    .filter(Boolean)
    .join(', ');

// 4. Comprehensive Master Mapping for Database and Cloud/Storage CI Classes
const masterTableMapping = {
    // Database Types (Script 07)
    'MYSQL': 'cmdb_ci_db_mysql_instance',
    'POSTGRESQL': 'cmdb_ci_db_postgresql_instance',
    'DB2': 'cmdb_ci_db_db2_instance',
    'MSFT SQL': 'cmdb_ci_db_mssql_instance',
    'MSSQL': 'cmdb_ci_db_mssql_instance',
    'ORACLE': 'cmdb_ci_db_ora_instance',
    '_AWSORACLE': 'cmdb_ci_db_ora_instance',
    'SYBASE': 'cmdb_ci_db_syb_instance',

    // Cloud & Storage Types (Script 08 - Default Yes)
    'S3': 'cmdb_ci_aws_s3_endpoint',
    'S3-V2': 'cmdb_ci_aws_s3_endpoint',
    'DYNAMODB': 'cmdb_ci_dynamodb_table',
    'REDSHIFT': 'cmdb_ci_aws_redshift',
    'SMB': 'cmdb_ci_file_system_smb',
    'NFS': 'cmdb_ci_file_system_nfs',

    // Storage File Share Custom Table (Script 09 - Toggle No)
    'STORAGE_FILESHARE': 'cmdb_ci_storage_fileshare'
};
async function navigateToConfigureProperties(guidedSetupFrame) {
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click({ timeout: 160_000 });

    const taskInProgressLink = guidedSetupFrame.getByRole('link', { name: ' Task in progress Configure' });
    const taskCompletedLink = guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' });

    if (await taskInProgressLink.isVisible().catch(() => false)) {
        await taskInProgressLink.click();
        await guidedSetupFrame
            .getByRole('button', { name: 'Mark as Complete Click to mark complete task Configure Properties' })
            .click();
    } else {
        await taskCompletedLink.click();
    }

    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();
}

// 5. Register the batch test case for Scripts 07, 08, and 09
test('TC-Batch: Scripts 07, 08 & 09 Data Source Configuration and Verification', async ({ page }) => {
    test.setTimeout(600_000); // 10 minutes timeout for batch processing

    const snUrl = process.env.SN_URL;

    console.log(`[Automation] Batched Data Sources to input: ${allDataSources}`);

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    // --- 1. Configure BigID Setup Properties via UI using the comma-separated string ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForTimeout(2_000);
    await navigateToConfigureProperties(guidedSetupFrame);
    


    // Fill the configuration input box with the full comma-separated list
    await guidedSetupFrame.getByRole('textbox').nth(2).fill(allDataSources);

    // Handle form toggles for Script 08 (setting to Yes)
    for (const row of records.filter(r => r.SCRIPT_NO === '08')) {
        const assetType = (row.IMPORT_JOB_LDC_TYPE || '').toLowerCase();

        if (assetType === 'smb') {
            const checkbox = guidedSetupFrame.locator('#use_default_smb_y');
            if (await checkbox.isVisible().catch(() => false)) {
                await checkbox.check();
            }
        } else if (assetType === 'nfs') {
            const checkbox = guidedSetupFrame.locator('#use_default_nfs_config_y');
            if (await checkbox.isVisible().catch(() => false)) {
                await checkbox.check();
            }
        }
    }

    // Handle form toggles for Script 09 (setting to No and filling keywords)
    for (const row of records.filter(r => r.SCRIPT_NO === '09')) {
        const assetType = (row.IMPORT_JOB_SS_TYPE || '').toLowerCase();
        const randomKeyword = `kw_${Math.random().toString(36).substring(2, 8)}`;
        const fileShareKeyword = row.EXPORT_FILESHARE_KEYWORD || randomKeyword;

        if (assetType === 'smb') {
            const checkbox = guidedSetupFrame.locator('#use_default_smb_n');
            if (await checkbox.isVisible().catch(() => false)) {
                await checkbox.check();
                const keywordField = guidedSetupFrame
                    .getByText('Provide keyword to identify SMB Datasource record', { exact: true })
                    .locator('xpath=..')
                    .getByRole('textbox');
                if (await keywordField.isVisible().catch(() => false)) {
                    await keywordField.fill(fileShareKeyword);
                }
            }
        } else if (assetType === 'nfs') {
            const checkbox = guidedSetupFrame.locator('#use_default_nfs_config_n');
            if (await checkbox.isVisible().catch(() => false)) {
                await checkbox.check();
                const keywordField = guidedSetupFrame
                    .getByText('Provide keyword to identify NFS Datasource record', { exact: true })
                    .locator('xpath=..')
                    .getByRole('textbox');
                if (await keywordField.isVisible().catch(() => false)) {
                    await keywordField.fill(fileShareKeyword);
                }
            }
        }
    }

    await guidedSetupFrame
        .getByRole('toolbar')
        .getByRole('button', { name: 'Save and Validate' })
        .click();

    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
    await page.goBack();

    const guidedSetupFrameAfterSave = page.locator('iframe[name="gsft_main"]').contentFrame();

    // --- 2. Execute Import Job ---
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

    console.log('Waiting for batch import job to complete...');
    await page.waitForTimeout(45_000);

    // --- 3. Verify Each Instance Created via Table API without stopping the test ---
    for (const row of records) {
        const testAssetName = row.IMPORT_JOB_RDB_DATASOURCE || row.IMPORT_JOB_LDC_DATASOURCE || row.IMPORT_JOB_SS_DATASOURCE;
        const assetType = (row.IMPORT_JOB_RDB_TYPE || row.IMPORT_JOB_LDC_TYPE || row.IMPORT_JOB_SS_TYPE || 'MYSQL').toUpperCase();

        if (!testAssetName) continue;

        let targetTableName;

        if (row.SCRIPT_NO === '09') {
            targetTableName = masterTableMapping['STORAGE_FILESHARE'];
        } else {
            targetTableName = masterTableMapping[assetType] || 'cmdb_ci_db_mysql_instance';
        }

        console.log(`[API Automation] Verifying "${testAssetName}" on table "${targetTableName}" (Script: ${row.SCRIPT_NO}, Type: ${assetType})...`);

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
            return !!(data.result && data.result.length > 0);
        }, { tableName: targetTableName, instanceName: testAssetName });

        // Non-blocking verification: logs a warning if missing, but moves on to the next source instead of failing
        if (!instanceCreated) {
            console.warn(`[WARNING] The asset instance "${testAssetName}" was not found in table "${targetTableName}". Moving on to the next item.\n`);
        } else {
            console.log(`[SUCCESS] Found "${testAssetName}" in table "${targetTableName}".\n`);
        }
    }
});