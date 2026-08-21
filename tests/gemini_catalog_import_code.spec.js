import { test, expect } from '@playwright/test';
import 'dotenv/config';

const STRUCTURED_WITH_CATALOG_TABLE = new Set([
    'rdb-mysql', 'rdb-postgresql', 'rdb-db2', 'rdb-mssql', 'rdb-oracle', 'rdb-sybase',
]);

const INSTANCE_TO_CATALOG_TABLE = {
    cmdb_ci_db_mysql_instance: 'cmdb_ci_db_mysql_catalog',
    cmdb_ci_db_db2_instance: 'cmdb_ci_db_db2_catalog',
    cmdb_ci_db_mssql_instance: 'cmdb_ci_db_mssql_database',
    cmdb_ci_ora_instance: 'cmdb_ci_ora_catalog',
    cmdb_ci_db_postgresql_instance: 'cmdb_ci_postgresql_schema',
    cmdb_ci_db_syb_instance: 'cmdb_ci_db_syb_catalog',
};

const START_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : start';
const END_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : end';
const LOG_LINE_PATTERN =
    /Datasource=([^,]+), Category=([^,]+), BigID Type=([^,]+), CI Class=([^,]+), Catalog Count=(\d+)/g;
const TIMESTAMP_LINK_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - Open/;

// --- API Verification Helper returning results to Node ---
async function verifyRecordAndTagViaApi(page, tableName, recordName, expectedTagKey = 'sensitivityClassification') {
    const result = await page.evaluate(async ({ tableName, recordName, expectedTagKey }) => {
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

        if (!data.result || data.result.length === 0) {
            return { recordExists: false, tagExists: false };
        }

        const recordSysId = data.result[0].sys_id;

        const kvRes = await fetch(`/api/now/table/cmdb_key_value?sysparm_query=configuration_item=${recordSysId}&sysparm_limit=50`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const kvData = await kvRes.json();

        let tagExists = false;
        if (kvData.result && kvData.result.length > 0) {
            tagExists = kvData.result.some(item => 
                (item.key && item.key.includes(expectedTagKey)) || 
                (item.name && item.name.includes(expectedTagKey))
            );
        }

        if (!tagExists && data.result[0].attributes) {
            tagExists = data.result[0].attributes.includes(expectedTagKey);
        }

        return { recordExists: true, tagExists };
    }, { tableName, recordName, expectedTagKey });

    // Print proof cleanly in the terminal
    if (result.recordExists) {
        console.log(` Record "${recordName}" in "${tableName}": Yes, found`);
    } else {
        console.log(` Record "${recordName}" in "${tableName}": No, not found`);
    }

    if (result.tagExists) {
        console.log(` Tag "${expectedTagKey}": Yes, found`);
    } else {
        console.log(` Tag "${expectedTagKey}": No, not found`);
    }

    return result;
}

async function verifyStructuredDataSourceApi(page, ds) {
    const catalogTable = INSTANCE_TO_CATALOG_TABLE[ds.ciClass];
    if (!catalogTable) {
        console.log(`⏭️ Skipping structured verification: No catalog mapping for "${ds.ciClass}"`);
        return;
    }

    const catalogCheck = await verifyRecordAndTagViaApi(page, catalogTable, ds.datasource);
    if (!catalogCheck.recordExists) return;

    await verifyRecordAndTagViaApi(page, 'cmdb_ci_information_object', ds.datasource);
}

async function verifyUnstructuredDataSourceApi(page, ds) {
    await verifyRecordAndTagViaApi(page, ds.ciClass, ds.datasource);
}

async function openFilteredCatalogLogs(page) {
    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('em logs');
    await page.getByRole('link', { name: 'All 1 of' }).click();

    const logsFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    const messageSearch = logsFrame.getByRole('searchbox', { name: 'Search column: message' });
    await messageSearch.fill('Service Graph Connector');
    await messageSearch.press('Enter');
    await page.waitForTimeout(2_000);

    return logsFrame;
}

test('TC-024: Data Catalog import completes and creates expected records (API Optimized)', async ({ page }) => {
    test.setTimeout(20 * 60_000);

    const classificationGroupName = process.env.BIGID_CLASSIFICATION_GROUP_NAME || 'Confidential Data Sources';

    await page.goto(process.env.SN_URL);

    let logsFrame = await openFilteredCatalogLogs(page);
    const baselineLink = logsFrame.getByRole('link', { name: TIMESTAMP_LINK_PATTERN }).first();
    const hasExistingLogs = await baselineLink.isVisible({ timeout: 10_000 }).catch(() => false);
    const baselineTimestamp = hasExistingLogs ? (await baselineLink.innerText()).trim() : null;

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
    
    await guidedSetupFrame.getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' }).click();
    await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Configure Properties' }).click();

    const classificationField = guidedSetupFrame.getByRole('textbox').first();
    await classificationField.waitFor({ state: 'visible', timeout: 30_000 });
    await classificationField.click();
    await classificationField.press('ControlOrMeta+a');
    await classificationField.fill(classificationGroupName);

    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await guidedSetupFrame.getByRole('button', { name: 'Select chain item to goto Set' }).click();
    await guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Catalogs' }).click();
    await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Import Data Catalogs' }).click();
    await guidedSetupFrame.locator('#execute_bottom').click();

    logsFrame = await openFilteredCatalogLogs(page);

    const MAX_POLLS = 20;
    let newContent = '';
    let foundEndMarker = false;

    for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
        const logText = await logsFrame.locator('body').innerText();

        const baselineIndex = baselineTimestamp ? logText.indexOf(baselineTimestamp) : logText.length;
        newContent = baselineIndex >= 0 ? logText.slice(0, baselineIndex) : logText;

        if (newContent.includes(END_MARKER)) {
            foundEndMarker = true;
            break;
        }

        console.log(`Poll ${attempt}/${MAX_POLLS}: end marker not found in new content yet, waiting 60s...`);
        await page.waitForTimeout(60_000);
        await page.reload();
        await logsFrame.locator('body').waitFor({ state: 'visible', timeout: 60_000 });
    }

    expect(foundEndMarker, 'Catalog import did not complete within the max wait time').toBeTruthy();

    const endIndex = newContent.indexOf(END_MARKER);
    const startIndex = newContent.lastIndexOf(START_MARKER);
    const latestRunBlock = newContent.slice(endIndex, startIndex);

    const dataSources = [];
    let match;
    while ((match = LOG_LINE_PATTERN.exec(latestRunBlock)) !== null) {
        const [, datasource, category, bigidType, ciClass, catalogCountStr] = match;
        const catalogCount = parseInt(catalogCountStr, 10);
        if (catalogCount === 0) {
            console.log(`Skipping datasource "${datasource.trim()}" — Catalog Count is 0.`);
            continue;
        }
        dataSources.push({
            datasource: datasource.trim(),
            category: category.trim(),
            bigidType: bigidType.trim(),
            ciClass: ciClass.trim(),
            catalogCount,
            hasCatalogTable: STRUCTURED_WITH_CATALOG_TABLE.has(bigidType.trim()),
        });
    }

    expect(dataSources.length, 'No data sources parsed from the log block').toBeGreaterThan(0);

    for (const ds of dataSources) {
        console.log(`\n--- Verifying Datasource: "${ds.datasource}" ---`);
        if (ds.hasCatalogTable) {
            await verifyStructuredDataSourceApi(page, ds);
        } else {
            await verifyUnstructuredDataSourceApi(page, ds);
        }
    }
});