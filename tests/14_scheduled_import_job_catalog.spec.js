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

// 2. FILTER records for Script 14
const records = allRecords.filter(row => row.SCRIPT_NO === '14');

// ---- Structured sources: BigID writes a SEPARATE catalog record (new row),
// keyed off the instance's mapped catalog table. Discovered via sys_created_on.
const STRUCTURED_CATALOG_TABLES = [
    'cmdb_ci_db_mysql_catalog',
    'cmdb_ci_db_db2_catalog',
    'cmdb_ci_db_ora_catalog',        // stores both Oracle and Oracle PDB catalogs
    'cmdb_ci_postgresql_schema',
    'cmdb_ci_db_syb_catalog',
    'cmdb_ci_db_mssql_database',
];

// ---- Unstructured sources: there is NO separate catalog table — the tag
// lands directly on the pre-existing instance/endpoint record. So we can't
// use "created since baseline" (the record already existed); we discover via
// sys_updated_on, then confirm with tag-creation time on cmdb_key_value.
// NOTE: for File Storage sources, whether the guided setup resolved to SMB,
// NFS, or the generic Storage File Share table depends on user config at
// setup time (per the class table doc) — we don't know which was picked
// without the log, so we sweep all three candidates every run.
const UNSTRUCTURED_INSTANCE_TABLES = [
    'cmdb_ci_aws_s3_endpoint',
    'cmdb_ci_storage_fileshare',
    'cmdb_ci_file_system_smb',
    'cmdb_ci_file_system_nfs',
    'cmdb_ci_aws_redshift',
    'cmdb_ci_dynamodb_table',
];

// ---- Information Object: also a net-new record per discovered data element,
// swept the same way as structured catalogs (created since baseline).
const INFORMATION_OBJECT_TABLE = 'cmdb_ci_information_object';

const START_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : start';
const END_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : end';
const TIMESTAMP_LINK_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - Open/;
const EXPECTED_TAG_KEY = 'sensitivityClassification';

function toEpoch(snDateTime) {
    // ServiceNow Table API returns sys_created_on / sys_updated_on as
    // "yyyy-MM-dd HH:mm:ss" in UTC with no offset suffix. Normalize to a
    // real ISO string before comparing, rather than trusting a
    // sysparm_query date literal comparison against instance timezone.
    if (!snDateTime) return null;
    return new Date(snDateTime.replace(' ', 'T') + 'Z').getTime();
}

/**
 * Checks cmdb_key_value for a tag on a known sys_id. Returns whether the tag
 * exists at all, AND (if baselineIso is given) whether that tag itself was
 * created after baseline — the strongest signal that THIS run produced it,
 * as opposed to a pre-existing tag from a prior run.
 */
async function checkTagOnRecord(page, sysId, expectedTagKey = EXPECTED_TAG_KEY, baselineIso = null) {
    return await page.evaluate(async ({ sysId, expectedTagKey, baselineIso }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        const kvRes = await fetch(
            `/api/now/table/cmdb_key_value?sysparm_query=configuration_item=${sysId}&sysparm_limit=50&sysparm_fields=key,name,sys_created_on`,
            { method: 'GET', credentials: 'include', headers }
        );
        const kvData = await kvRes.json();

        let tagExists = false;
        let tagCreatedAfterBaseline = false;
        const baseline = baselineIso ? new Date(baselineIso).getTime() : null;

        if (kvData.result && kvData.result.length > 0) {
            for (const item of kvData.result) {
                const matches = (item.key && item.key.includes(expectedTagKey)) ||
                    (item.name && item.name.includes(expectedTagKey));
                if (!matches) continue;
                tagExists = true;
                if (baseline && item.sys_created_on) {
                    const created = new Date(item.sys_created_on.replace(' ', 'T') + 'Z').getTime();
                    if (created > baseline) tagCreatedAfterBaseline = true;
                }
            }
        }

        return { tagExists, tagCreatedAfterBaseline };
    }, { sysId, expectedTagKey, baselineIso });
}

/** Structured catalogs / Information Object: net-new rows since baseline. */
async function fetchRecordsCreatedAfter(page, tableName, baselineIso, limit = 100) {
    return await page.evaluate(async ({ tableName, baselineIso, limit }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        const res = await fetch(
            `/api/now/table/${tableName}?sysparm_query=ORDERBYDESCsys_created_on&sysparm_limit=${limit}&sysparm_fields=sys_id,name,sys_created_on`,
            { method: 'GET', credentials: 'include', headers }
        );
        const data = await res.json();
        if (!data.result) return [];

        const baseline = new Date(baselineIso).getTime();
        return data.result
            .filter(r => {
                if (!r.sys_created_on) return false;
                const created = new Date(r.sys_created_on.replace(' ', 'T') + 'Z').getTime();
                return created > baseline;
            })
            .map(r => ({ sysId: r.sys_id, name: r.name, timestamp: r.sys_created_on }));
    }, { tableName, baselineIso, limit });
}

/** Unstructured instance tables: pre-existing rows, discovered via sys_updated_on. */
async function fetchRecordsUpdatedAfter(page, tableName, baselineIso, limit = 100) {
    return await page.evaluate(async ({ tableName, baselineIso, limit }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        const res = await fetch(
            `/api/now/table/${tableName}?sysparm_query=ORDERBYDESCsys_updated_on&sysparm_limit=${limit}&sysparm_fields=sys_id,name,sys_updated_on`,
            { method: 'GET', credentials: 'include', headers }
        );
        const data = await res.json();
        if (!data.result) return [];

        const baseline = new Date(baselineIso).getTime();
        return data.result
            .filter(r => {
                if (!r.sys_updated_on) return false;
                const updated = new Date(r.sys_updated_on.replace(' ', 'T') + 'Z').getTime();
                return updated > baseline;
            })
            .map(r => ({ sysId: r.sys_id, name: r.name, timestamp: r.sys_updated_on }));
    }, { tableName, baselineIso, limit });
}

async function verifyStructuredCatalogTable(page, tableName, baselineIso) {
    const newRecords = await fetchRecordsCreatedAfter(page, tableName, baselineIso);
    console.log(`\n--- [structured] ${tableName}: ${newRecords.length} new record(s) since baseline ---`);

    for (const rec of newRecords) {
        const { tagExists, tagCreatedAfterBaseline } = await checkTagOnRecord(page, rec.sysId, EXPECTED_TAG_KEY, baselineIso);
        console.log(` "${rec.name}" (created ${rec.timestamp}) — tag found: ${tagExists}, tag is new: ${tagCreatedAfterBaseline}`);
        expect(tagExists, `Expected "${EXPECTED_TAG_KEY}" tag on new catalog record "${rec.name}" in ${tableName}`).toBeTruthy();
    }

    return newRecords;
}

async function verifyUnstructuredInstanceTable(page, tableName, baselineIso) {
    const updatedRecords = await fetchRecordsUpdatedAfter(page, tableName, baselineIso);
    console.log(`\n--- [unstructured] ${tableName}: ${updatedRecords.length} record(s) updated since baseline ---`);

    // Of the updated candidates, keep only ones where the tag itself is new —
    // sys_updated_on alone is a weak signal since other things can touch it.
    const confirmed = [];
    for (const rec of updatedRecords) {
        const { tagExists, tagCreatedAfterBaseline } = await checkTagOnRecord(page, rec.sysId, EXPECTED_TAG_KEY, baselineIso);
        console.log(` "${rec.name}" (updated ${rec.timestamp}) — tag found: ${tagExists}, tag is new: ${tagCreatedAfterBaseline}`);
        if (tagCreatedAfterBaseline) confirmed.push(rec);
    }

    return confirmed;
}

async function verifyInformationObjects(page, baselineIso) {
    const newRecords = await fetchRecordsCreatedAfter(page, INFORMATION_OBJECT_TABLE, baselineIso);
    console.log(`\n--- [information object] ${INFORMATION_OBJECT_TABLE}: ${newRecords.length} new record(s) since baseline ---`);

    for (const rec of newRecords) {
        const { tagExists, tagCreatedAfterBaseline } = await checkTagOnRecord(page, rec.sysId, EXPECTED_TAG_KEY, baselineIso);
        console.log(` "${rec.name}" (created ${rec.timestamp}) — tag found: ${tagExists}, tag is new: ${tagCreatedAfterBaseline}`);
    }

    return newRecords;
}

/**
 * Generic hardened navigation helper: clicks the "All" application menu item,
 * clears any existing filter, types a search term, and waits for + clicks the
 * resulting link. Retries the whole sequence if any step doesn't resolve,
 * since ServiceNow's classic UI list/menu refreshes are async and don't
 * always finish before the next click would otherwise fire.
 */
async function navigateToAllMenuAndSearch(page, searchTerm, linkNameOrPattern, { retries = 3, timeout = 15_000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const allMenuItem = page.getByRole('menuitem', { name: 'All' });
            await allMenuItem.waitFor({ state: 'visible', timeout });
            await allMenuItem.click();

            const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
            if (await clearFilterButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
                await clearFilterButton.click();
            }

            const searchBox = page.getByRole('textbox', { name: 'Enter search term to filter' });
            await searchBox.waitFor({ state: 'visible', timeout });
            await searchBox.fill(searchTerm);

            const targetLink = page.getByRole('link', { name: linkNameOrPattern });
            await targetLink.waitFor({ state: 'visible', timeout });
            await targetLink.click();

            return; // success
        } catch (err) {
            lastError = err;
            console.log(`Attempt ${attempt}/${retries} to navigate via "${searchTerm}" -> "${linkNameOrPattern}" failed: ${err.message}`);
            if (attempt < retries) {
                await page.waitForTimeout(2_000);
            }
        }
    }
    throw new Error(`navigateToAllMenuAndSearch failed after ${retries} attempts for "${searchTerm}": ${lastError?.message}`);
}

async function openFilteredCatalogLogs(page) {
    await navigateToAllMenuAndSearch(page, 'em logs', 'All 1 of');

    const logsFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await logsFrame.locator('body').waitFor({ state: 'visible', timeout: 20_000 });

    const messageSearch = logsFrame.getByRole('searchbox', { name: 'Search column: message' });
    await messageSearch.waitFor({ state: 'visible', timeout: 20_000 });
    await messageSearch.fill('Service Graph Connector');
    await messageSearch.press('Enter');

    await expect(messageSearch).toHaveValue('Service Graph Connector');
    await page.waitForLoadState('networkidle').catch(() => { });

    return logsFrame;
}

for (const row of records) {
    test(`TC-14: Data Catalog import for group (${row.CLASSIFICATION_GROUP_NAME})`, async ({ page }) => {
        test.setTimeout(60 * 60_000);

        const classificationGroupName = row.CLASSIFICATION_GROUP_NAME;

        await page.goto(process.env.SN_URL);

        let logsFrame = await openFilteredCatalogLogs(page);
        const baselineLink = logsFrame.getByRole('link', { name: TIMESTAMP_LINK_PATTERN }).first();
        const hasExistingLogs = await baselineLink.isVisible({ timeout: 20_000 }).catch(() => false);
        const baselineLogTimestamp = hasExistingLogs ? (await baselineLink.innerText()).trim() : null;

        await navigateToAllMenuAndSearch(page, 'bigid', 'Setup 1 of');

        const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
        await guidedSetupFrame
            .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
            .click({ timeout: 60_000 });
        await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
        await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Configure Properties' }).click();

        const classificationField = guidedSetupFrame.getByRole('textbox').first();
        await classificationField.waitFor({ state: 'visible', timeout: 30_000 });
        await classificationField.click();
        await classificationField.press('ControlOrMeta+a');
        await classificationField.fill(classificationGroupName);

        await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

        await navigateToAllMenuAndSearch(page, 'bigid', 'Setup 1 of');
        await guidedSetupFrame.getByRole('button', { name: 'Select chain item to goto Set' }).click();
        // await guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Catalogs' }).click();
        // The Import Data Sources task may already show as completed (from a prior
        // run) or still be in progress — handle both without marking it complete ourselves.
        const importInProgressLink = guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Catalogs' });
        const importCompletedLink = guidedSetupFrame.getByRole('link', { name: ' Task completed Import Data Catalogs' });

        if (await importInProgressLink.isVisible().catch(() => false)) {
            await importInProgressLink.click();
        } else {
            await importCompletedLink.click();
        }
        await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Import Data Catalogs' }).click();

        // Baseline for ALL table-driven checks below — captured right before we
        // trigger the job, independent of the log's own baseline timestamp.
        const catalogQueryBaselineIso = new Date().toISOString();

        await guidedSetupFrame.locator('#execute_bottom').click();

        logsFrame = await openFilteredCatalogLogs(page);

        const MAX_POLLS = 60;
        let newLogContent = '';
        let foundEndMarker = false;

        for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
            const logText = await logsFrame.locator('body').innerText();

            const baselineIndex = baselineLogTimestamp ? logText.indexOf(baselineLogTimestamp) : logText.length;
            newLogContent = baselineIndex >= 0 ? logText.slice(0, baselineIndex) : logText;

            if (newLogContent.includes(END_MARKER)) {
                foundEndMarker = true;
                break;
            }

            console.log(`Poll ${attempt}/${MAX_POLLS}: end marker not found in new content yet, waiting 60s...`);
            await page.waitForTimeout(60_000);
            await page.reload();
            await logsFrame.locator('body').waitFor({ state: 'visible', timeout: 60_000 });
        }

        expect(foundEndMarker, 'Catalog import did not complete within the max wait time').toBeTruthy();

        // Job confirmed complete — now discover results purely via table sweeps
        // instead of parsing datasource lines out of the log.

        let totalStructured = 0;
        for (const table of STRUCTURED_CATALOG_TABLES) {
            const recs = await verifyStructuredCatalogTable(page, table, catalogQueryBaselineIso);
            totalStructured += recs.length;
        }

        let totalUnstructured = 0;
        for (const table of UNSTRUCTURED_INSTANCE_TABLES) {
            const recs = await verifyUnstructuredInstanceTable(page, table, catalogQueryBaselineIso);
            totalUnstructured += recs.length;
        }

        const infoObjects = await verifyInformationObjects(page, catalogQueryBaselineIso);

        console.log(`\nSummary: ${totalStructured} structured catalog record(s), ${totalUnstructured} unstructured record(s) newly tagged, ${infoObjects.length} new Information Object(s).`);

        expect(
            totalStructured + totalUnstructured,
            'No new/updated catalog records found across structured or unstructured tables since baseline'
        ).toBeGreaterThan(0);
    });
}


// COMMENT OUT THIS CODE AND COMMENT THE ABOVE CODE IF YOU WISH TO RUN THIS TEST WITH THE MODIFIED CATALOG IMPORT SCRIPT
// import { test, expect } from '@playwright/test';
// import fs from 'fs';
// import path from 'path';
// import { parse } from 'csv-parse/sync';
// import 'dotenv/config';

// // 1. Read and parse the Master CSV file at startup
// const csvFilePath = path.join(__dirname, '../test-data/dataSource.csv');
// const allRecords = parse(fs.readFileSync(csvFilePath, 'utf8'), {
//     columns: true,
//     skip_empty_lines: true,
// });

// // 2. FILTER records for Script 08
// const records = allRecords.filter(row => row.SCRIPT_NO === '14');

// const STRUCTURED_WITH_CATALOG_TABLE = new Set([
//     'rdb-mysql', 'rdb-postgresql', 'rdb-db2', 'rdb-mssql', 'rdb-oracle', 'rdb-sybase',
// ]);

// const INSTANCE_TO_CATALOG_TABLE = {
//     cmdb_ci_db_mysql_instance: 'cmdb_ci_db_mysql_catalog',
//     cmdb_ci_db_db2_instance: 'cmdb_ci_db_db2_catalog',
//     cmdb_ci_db_mssql_instance: 'cmdb_ci_db_mssql_database',
//     cmdb_ci_ora_instance: 'cmdb_ci_ora_catalog',
//     cmdb_ci_db_postgresql_instance: 'cmdb_ci_postgresql_schema',
//     cmdb_ci_db_syb_instance: 'cmdb_ci_db_syb_catalog',
// };

// const START_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : start';
// const END_MARKER = 'Service Graph Connector for BigID : BigID Data Catalogs Import Scheduled Job : end';
// const LOG_LINE_PATTERN =
//     /Datasource=([^,]+), Category=([^,]+), BigID Type=([^,]+), CI Class=([^,]+), Catalog Count=(\d+)/g;
// const TIMESTAMP_LINK_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - Open/;

// async function verifyRecordAndTagViaApi(page, tableName, recordName, expectedTagKey = 'sensitivityClassification', useContains = false) {
//     const result = await page.evaluate(async ({ tableName, recordName, expectedTagKey, useContains }) => {
//         const token = window.g_ck || (window.top && window.top.g_ck) || '';
//         const headers = {
//             'Content-Type': 'application/json',
//             'Accept': 'application/json',
//             'X-UserToken': token
//         };

//         // Use 'STARTSWITH' or 'CONTAINS' for catalogs where names append path/correlation identifiers
//         const queryOperator = useContains ? `STARTSWITH` : `=`;
//         const res = await fetch(`/api/now/table/${tableName}?sysparm_query=name${queryOperator}${encodeURIComponent(recordName)}&sysparm_limit=1`, {
//             method: 'GET',
//             credentials: 'include',
//             headers
//         });
//         const data = await res.json();

//         if (!data.result || data.result.length === 0) {
//             return { recordExists: false, tagExists: false };
//         }

//         const recordSysId = data.result[0].sys_id;

//         const kvRes = await fetch(`/api/now/table/cmdb_key_value?sysparm_query=configuration_item=${recordSysId}&sysparm_limit=50`, {
//             method: 'GET',
//             credentials: 'include',
//             headers
//         });
//         const kvData = await kvRes.json();

//         let tagExists = false;
//         if (kvData.result && kvData.result.length > 0) {
//             tagExists = kvData.result.some(item =>
//                 (item.key && item.key.includes(expectedTagKey)) ||
//                 (item.name && item.name.includes(expectedTagKey))
//             );
//         }

//         if (!tagExists && data.result[0].attributes) {
//             tagExists = data.result[0].attributes.includes(expectedTagKey);
//         }

//         return { recordExists: true, tagExists };
//     }, { tableName, recordName, expectedTagKey, useContains });

//     if (result.recordExists) {
//         console.log(` Record matching "${recordName}" in "${tableName}": Yes, found`);
//     } else {
//         console.log(` Record matching "${recordName}" in "${tableName}": No, not found`);
//     }

//     if (result.tagExists) {
//         console.log(` Tag "${expectedTagKey}": Yes, found`);
//     } else {
//         console.log(` Tag "${expectedTagKey}": No, not found`);
//     }

//     return result;
// }

// async function verifyStructuredDataSourceApi(page, ds) {
//     const catalogTable = INSTANCE_TO_CATALOG_TABLE[ds.ciClass];
//     if (!catalogTable) {
//         console.log(`Skipping structured verification: No catalog mapping for "${ds.ciClass}"`);
//         return;
//     }

//     // Pass useContains = true so it handles compound correlation names like "Name@schema@path"
//     const catalogCheck = await verifyRecordAndTagViaApi(page, catalogTable, ds.datasource, 'sensitivityClassification', true);
//     if (!catalogCheck.recordExists) return;

//     await verifyRecordAndTagViaApi(page, 'cmdb_ci_information_object', ds.datasource, 'sensitivityClassification', true);
// }

// async function verifyUnstructuredDataSourceApi(page, ds) {
//     await verifyRecordAndTagViaApi(page, ds.ciClass, ds.datasource);
// }

// /**
//  * Generic hardened navigation helper: clicks the "All" application menu item,
//  * clears any existing filter, types a search term, and waits for + clicks the
//  * resulting link. Retries the whole sequence if any step doesn't resolve,
//  * since ServiceNow's classic UI list/menu refreshes are async and don't
//  * always finish before the next click would otherwise fire.
//  */
// async function navigateToAllMenuAndSearch(page, searchTerm, linkNameOrPattern, { retries = 3, timeout = 15_000 } = {}) {
//     let lastError;
//     for (let attempt = 1; attempt <= retries; attempt++) {
//         try {
//             const allMenuItem = page.getByRole('menuitem', { name: 'All' });
//             await allMenuItem.waitFor({ state: 'visible', timeout });
//             await allMenuItem.click();

//             const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
//             if (await clearFilterButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
//                 await clearFilterButton.click();
//             }

//             const searchBox = page.getByRole('textbox', { name: 'Enter search term to filter' });
//             await searchBox.waitFor({ state: 'visible', timeout });
//             await searchBox.fill(searchTerm);

//             const targetLink = page.getByRole('link', { name: linkNameOrPattern });
//             await targetLink.waitFor({ state: 'visible', timeout });
//             await targetLink.click();

//             return; // success
//         } catch (err) {
//             lastError = err;
//             console.log(`Attempt ${attempt}/${retries} to navigate via "${searchTerm}" -> "${linkNameOrPattern}" failed: ${err.message}`);
//             if (attempt < retries) {
//                 await page.waitForTimeout(2_000);
//             }
//         }
//     }
//     throw new Error(`navigateToAllMenuAndSearch failed after ${retries} attempts for "${searchTerm}": ${lastError?.message}`);
// }

// async function openFilteredCatalogLogs(page) {
//     await navigateToAllMenuAndSearch(page, 'em logs', 'All 1 of');

//     const logsFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
//     await logsFrame.locator('body').waitFor({ state: 'visible', timeout: 20_000 });

//     const messageSearch = logsFrame.getByRole('searchbox', { name: 'Search column: message' });
//     await messageSearch.waitFor({ state: 'visible', timeout: 20_000 });
//     await messageSearch.fill('Service Graph Connector');
//     await messageSearch.press('Enter');

//     // Wait for the filter to actually apply instead of a flat sleep.
//     await expect(messageSearch).toHaveValue('Service Graph Connector');
//     await page.waitForLoadState('networkidle').catch(() => {});

//     return logsFrame;
// }

// for (const row of records) {
// test(`TC-14: Data Catalog import for group (${row.CLASSIFICATION_GROUP_NAME})`, async ({ page }) => {
//     test.setTimeout(60 * 60_000);

//     const classificationGroupName = row.CLASSIFICATION_GROUP_NAME;

//     await page.goto(process.env.SN_URL);

//     let logsFrame = await openFilteredCatalogLogs(page);
//     const baselineLink = logsFrame.getByRole('link', { name: TIMESTAMP_LINK_PATTERN }).first();
//     // Bumped timeout: on a slow render the list may not have the baseline row
//     // visible yet at 10s, which previously caused baselineTimestamp to be
//     // wrongly recorded as null.
//     const hasExistingLogs = await baselineLink.isVisible({ timeout: 20_000 }).catch(() => false);
//     const baselineTimestamp = hasExistingLogs ? (await baselineLink.innerText()).trim() : null;

//     await navigateToAllMenuAndSearch(page, 'bigid', 'Setup 1 of');

//     const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
//     await guidedSetupFrame
//       .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//       .click({ timeout: 60_000 });
//     await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
//     await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Configure Properties' }).click();

//     const classificationField = guidedSetupFrame.getByRole('textbox').first();
//     await classificationField.waitFor({ state: 'visible', timeout: 30_000 });
//     await classificationField.click();
//     await classificationField.press('ControlOrMeta+a');
//     await classificationField.fill(classificationGroupName);

//     await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
//     await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();

//     await navigateToAllMenuAndSearch(page, 'bigid', 'Setup 1 of');
//     await guidedSetupFrame.getByRole('button', { name: 'Select chain item to goto Set' }).click();
//     await guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Catalogs' }).click();
//     await guidedSetupFrame.getByRole('link', { name: 'Configure Click to configure task Import Data Catalogs' }).click();
//     await guidedSetupFrame.locator('#execute_bottom').click();

//     logsFrame = await openFilteredCatalogLogs(page);

//     const MAX_POLLS = 60;
//     let newContent = '';
//     let foundEndMarker = false;

//     for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
//         const logText = await logsFrame.locator('body').innerText();

//         const baselineIndex = baselineTimestamp ? logText.indexOf(baselineTimestamp) : logText.length;
//         newContent = baselineIndex >= 0 ? logText.slice(0, baselineIndex) : logText;

//         if (newContent.includes(END_MARKER)) {
//             foundEndMarker = true;
//             break;
//         }

//         console.log(`Poll ${attempt}/${MAX_POLLS}: end marker not found in new content yet, waiting 60s...`);
//         await page.waitForTimeout(60_000);
//         await page.reload();
//         await logsFrame.locator('body').waitFor({ state: 'visible', timeout: 60_000 });
//     }

//     expect(foundEndMarker, 'Catalog import did not complete within the max wait time').toBeTruthy();

//     const endIndex = newContent.indexOf(END_MARKER);
//     const startIndex = newContent.lastIndexOf(START_MARKER);
//     const latestRunBlock = newContent.slice(endIndex, startIndex);

//     const dataSources = [];
//     let match;
//     while ((match = LOG_LINE_PATTERN.exec(latestRunBlock)) !== null) {
//         const [, datasource, category, bigidType, ciClass, catalogCountStr] = match;
//         const catalogCount = parseInt(catalogCountStr, 10);
//         if (catalogCount === 0) {
//             console.log(`Skipping datasource "${datasource.trim()}" — Catalog Count is 0.`);
//             continue;
//         }
//         dataSources.push({
//             datasource: datasource.trim(),
//             category: category.trim(),
//             bigidType: bigidType.trim(),
//             ciClass: ciClass.trim(),
//             catalogCount,
//             hasCatalogTable: STRUCTURED_WITH_CATALOG_TABLE.has(bigidType.trim()),
//         });
//     }

//     expect(dataSources.length, 'No data sources parsed from the log block').toBeGreaterThan(0);

//     for (const ds of dataSources) {
//         console.log(`\n--- Verifying Datasource: "${ds.datasource}" ---`);
//         if (ds.hasCatalogTable) {
//             await verifyStructuredDataSourceApi(page, ds);
//         } else {
//             await verifyUnstructuredDataSourceApi(page, ds);
//         }
//     }
// });
// }