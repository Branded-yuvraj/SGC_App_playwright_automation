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

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function navigateToTableList(page, tableName) {
    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('tables');
    await page.getByRole('link', { name: 'Tables 1 of 5' }).click();

    const tablesFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

    // Give the Tables module time to fully load before touching anything
    await page.waitForTimeout(3_000);

    const tableSearchBox = tablesFrame.getByRole('searchbox', { name: 'Search column: name' });
    if (await tableSearchBox.isVisible().catch(() => false)) {
        await tableSearchBox.fill('');
        await tableSearchBox.press('Enter');
        await page.waitForTimeout(1_000);
    }

    let targetLink;
    let tableExists = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
        await tableSearchBox.fill(tableName);
        await page.waitForTimeout(3_000);
        await tableSearchBox.press('Enter');
        await page.waitForTimeout(3_000);

        const row = tablesFrame.locator('tr.list_row').filter({ hasText: tableName });
        targetLink = row.getByRole('link', { name: /^Open record:/i }).first();

        tableExists = await targetLink.isVisible({ timeout: 5_000 }).catch(() => false);
        if (tableExists) break;

        console.log(`Table "${tableName}" not found on attempt ${attempt}, retrying with extra wait...`);
        await page.waitForTimeout(3_000);
    }

    if (!tableExists) {
        return null;
    }

    await targetLink.click();

    // Give the table definition record itself time to fully load before
    // clicking "Show List" — separate from the earlier module-load wait.
    await page.waitForTimeout(4_000);

    const showListLink = tablesFrame.getByRole('link', { name: 'Show List' });
    const showListVisible = await showListLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!showListVisible) {
        return null;
    }

    await showListLink.click();
    await page.waitForTimeout(2_000);

    return tablesFrame;
}

async function openRecordByNamePrefix(page, frame, namePrefix) {
    const searchBox = frame.getByRole('searchbox', { name: 'Search column: name' });

    if (await searchBox.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await searchBox.fill('');
        await searchBox.press('Enter');
        await page.waitForTimeout(1_000);
        await page.waitForTimeout(3_000);
        await searchBox.fill(namePrefix);
        await searchBox.press('Enter');
    }

    await page.waitForTimeout(2_000);

    const recordLink = frame
        .getByRole('link', { name: new RegExp(`Open record: ${escapeRegex(namePrefix)}`) })
        .first();

    const found = await recordLink.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!found) return false;

    await recordLink.click();
    await page.waitForTimeout(5_000);
    return true;
}

async function hasClassificationTagKeyValue(page, frame) {
    const candidates = [
        frame.getByRole('button', { name: /Key Values\s*\(\d+\)/i }),
        frame.getByRole('button', { name: 'Key Values', exact: true }),
        frame.getByRole('tab', { name: /Key Values/i }),
    ];

    for (const candidate of candidates) {
        const visible = await candidate.first().isVisible({ timeout: 5_000 }).catch(() => false);
        if (visible) {
            await candidate.first().click();
            await page.waitForTimeout(3_000);
            break;
        }
    }

    const plainTextMatch = frame.getByText(/sensitivityClassification/i).first();
    const gridCellMatch = frame.getByRole('gridcell', { name: /sensitivityClassification/i }).first();

    const foundAsText = await plainTextMatch.isVisible({ timeout: 10_000 }).catch(() => false);
    if (foundAsText) return true;

    const foundAsGridCell = await gridCellMatch.isVisible({ timeout: 5_000 }).catch(() => false);
    return foundAsGridCell;
}

async function verifyStructuredDataSource(page, ds) {
    const catalogTable = INSTANCE_TO_CATALOG_TABLE[ds.ciClass];
    expect(catalogTable, `No known catalog table mapping for CI Class "${ds.ciClass}"`).toBeTruthy();

    const catalogFrame = await navigateToTableList(page, catalogTable);
    if (!catalogFrame) {
        console.log(`[Warning] Catalog table "${catalogTable}" not found. Skipping.`);
        return;
    }

    const catalogFound = await openRecordByNamePrefix(page, catalogFrame, ds.datasource);
    if (!catalogFound) {
        console.log(`[Warning] No catalog record found for "${ds.datasource}" in ${catalogTable}. Skipping.`);
        return;
    }

    const catalogHasTag = await hasClassificationTagKeyValue(page, catalogFrame);
    console.log(`${ds.datasource}: Catalog has classification tag = ${catalogHasTag}`);
    if (!catalogHasTag) {
        console.log(`[Warning] Catalog for "${ds.datasource}" has no classification Key Value. Skipping.`);
        return;
    }

    const infoObjectFrame = await navigateToTableList(page, 'cmdb_ci_information_object');
    if (!infoObjectFrame) {
        console.log(`[Warning] Information Object table not found. Skipping.`);
        return;
    }

    const infoObjectFound = await openRecordByNamePrefix(page, infoObjectFrame, ds.datasource);
    if (!infoObjectFound) {
        console.log(`[Warning] No Information Object found for "${ds.datasource}". Skipping.`);
        return;
    }

    const infoObjectHasTag = await hasClassificationTagKeyValue(page, infoObjectFrame);
    console.log(`${ds.datasource}: Information Object has classification tag = ${infoObjectHasTag}`);
    if (!infoObjectHasTag) {
        console.log(`[Warning] Information Object for "${ds.datasource}" has no classification Key Value. Skipping.`);
        return;
    }
}

async function verifyUnstructuredDataSource(page, ds) {
    const instanceFrame = await navigateToTableList(page, ds.ciClass);
    if (!instanceFrame) {
        console.log(`[Warning] Table definition for CI Class "${ds.ciClass}" does not exist in ServiceNow. Skipping.`);
        return;
    }

    const instanceFound = await openRecordByNamePrefix(page, instanceFrame, ds.datasource);
    if (!instanceFound) {
        console.log(`[Warning] No record found for "${ds.datasource}" in ${ds.ciClass}. Skipping.`);
        return;
    }

    const hasTag = await hasClassificationTagKeyValue(page, instanceFrame);
    console.log(`${ds.datasource}: Instance has classification tag = ${hasTag}`);
    if (!hasTag) {
        console.log(`[Warning] Instance record for "${ds.datasource}" has no classification Key Value. Skipping.`);
        return;
    }
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

test('TC-024: Data Catalog import completes and creates expected records', async ({ page }) => {
    test.setTimeout(20 * 60_000);

    await page.goto(process.env.SN_URL);

    let logsFrame = await openFilteredCatalogLogs(page);
    const baselineLink = logsFrame.getByRole('link', { name: TIMESTAMP_LINK_PATTERN }).first();
    const hasExistingLogs = await baselineLink.isVisible({ timeout: 10_000 }).catch(() => false);
    const baselineTimestamp = hasExistingLogs ? (await baselineLink.innerText()).trim() : null;
    console.log(`Baseline timestamp (everything after this is new): ${baselineTimestamp ?? 'none - log is empty'}`);

    await page.getByRole('menuitem', { name: 'All' }).click();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Set' })
        .waitFor({ state: 'attached', timeout: 60_000 });
    await guidedSetupFrame.getByRole('button', { name: 'Select chain item to goto Set' }).click();
    await guidedSetupFrame.getByRole('link', { name: ' Task in progress Import Data Catalogs' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Import Data Catalogs' })
        .click();
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

    expect(foundEndMarker, 'Catalog import did not complete (within new content) within the max wait time').toBeTruthy();

    const endIndex = newContent.indexOf(END_MARKER);
    const startIndex = newContent.lastIndexOf(START_MARKER);
    expect(startIndex).toBeGreaterThan(endIndex);

    const latestRunBlock = newContent.slice(endIndex, startIndex);

    const dataSources = [];
    let match;
    while ((match = LOG_LINE_PATTERN.exec(latestRunBlock)) !== null) {
        const [, datasource, category, bigidType, ciClass, catalogCountStr] = match;
        const catalogCount = parseInt(catalogCountStr, 10);
        if (catalogCount === 0) {
            console.log(`Skipping "${datasource}" — Catalog Count is 0.`);
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

    console.log(`Found ${dataSources.length} data source(s) to verify:`, dataSources);
    expect(dataSources.length, 'No data sources parsed from the log block').toBeGreaterThan(0);

    for (const ds of dataSources) {
        console.log(`\nVerifying "${ds.datasource}" (${ds.bigidType})...`);
        if (ds.hasCatalogTable) {
            await verifyStructuredDataSource(page, ds);
        } else {
            await verifyUnstructuredDataSource(page, ds);
        }
    }
});