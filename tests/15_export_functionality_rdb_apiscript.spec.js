import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Server and Instance export workflow via API', async ({ page }) => {
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

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    // Forward browser console logs containing '[API Automation]' directly to your terminal
    page.on('console', msg => {
        if (msg.text().includes('[API Automation]')) {
            console.log(msg.text());
        }
    });

    console.log(`Starting API-driven Server/Instance CMDB setup for class: ${tableName}`);

    // --- 1, 2 & 3. Pure API-Driven Parent CI, Instance CI, and Relationship Creation ---
    await page.evaluate(async ({ parentClass, parentCIName, tableName, instanceName, relType }) => {
        const token = window.g_ck || (window.top && window.top.g_ck) || '';
        console.log(`[API Automation] Session Token found: ${token ? 'YES (' + token.substring(0, 5) + '...)' : 'NO'}`);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserToken': token
        };

        // --- 1. Handle Parent CI (Create or Verify) ---
        console.log(`[API Automation] Checking if Parent CI exists on table "${parentClass}" where name = "${parentCIName}"`);
        const parentGetRes = await fetch(`/api/now/table/${parentClass}?sysparm_query=name=${encodeURIComponent(parentCIName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const parentGetData = await parentGetRes.json();
        let parentSysId = '';

        if (parentGetData.result && parentGetData.result.length > 0) {
            parentSysId = parentGetData.result[0].sys_id;
            console.log(`[API Automation] Parent CI already exists with sys_id: ${parentSysId}`);
        } else {
            console.log(`[API Automation] Parent CI not found. Creating new record...`);
            const parentCreateRes = await fetch(`/api/now/table/${parentClass}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ name: parentCIName })
            });
            const parentCreateData = await parentCreateRes.json();
            if (parentCreateRes.ok && parentCreateData.result) {
                parentSysId = parentCreateData.result.sys_id;
                console.log(`[API Automation] Successfully created Parent CI with sys_id: ${parentSysId}`);
            } else {
                console.log(`[API Automation] ERROR creating Parent CI: ${JSON.stringify(parentCreateData)}`);
            }
        }

        // --- 2. Handle Instance CI (Create or Verify) ---
        console.log(`[API Automation] Checking if Instance CI exists on table "${tableName}" where name = "${instanceName}"`);
        const instanceGetRes = await fetch(`/api/now/table/${tableName}?sysparm_query=name=${encodeURIComponent(instanceName)}&sysparm_limit=1`, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const instanceGetData = await instanceGetRes.json();
        let instanceSysId = '';

        if (instanceGetData.result && instanceGetData.result.length > 0) {
            instanceSysId = instanceGetData.result[0].sys_id;
            console.log(`[API Automation] Instance CI already exists with sys_id: ${instanceSysId}`);
        } else {
            console.log(`[API Automation] Instance CI not found. Creating new record...`);
            const instanceCreateRes = await fetch(`/api/now/table/${tableName}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ name: instanceName })
            });
            const instanceCreateData = await instanceCreateRes.json();
            if (instanceCreateRes.ok && instanceCreateData.result) {
                instanceSysId = instanceCreateData.result.sys_id;
                console.log(`[API Automation] Successfully created Instance CI with sys_id: ${instanceSysId}`);
            } else {
                console.log(`[API Automation] ERROR creating Instance CI: ${JSON.stringify(instanceCreateData)}`);
            }
        }

        // --- 3. Handle Relationship CI (`cmdb_rel_ci`) ---
        if (instanceSysId && parentSysId) {
            console.log(`[API Automation] Looking up relationship type '${relType}'...`);
            const typeRes = await fetch(`/api/now/table/cmdb_rel_type?sysparm_query=name=${encodeURIComponent(relType)}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const typeData = await typeRes.json();
            let relTypeSysId = typeData.result && typeData.result.length > 0 ? typeData.result[0].sys_id : '';
            console.log(`[API Automation] Relationship type sys_id: ${relTypeSysId || 'Not found (will omit type)'}`);

            console.log(`[API Automation] Checking if relationship exists between parent=${instanceSysId} and child=${parentSysId}...`);
            let relQuery = `parent=${instanceSysId}^child=${parentSysId}`;
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
                const relPayload = { parent: instanceSysId, child: parentSysId };
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
            console.log(`[API Automation] Skipping relationship creation due to missing instance or parent sys_id.`);
        }
    }, { parentClass, parentCIName, tableName, instanceName, relType });

    await page.waitForTimeout(2_000);

    const gsftMain = page.locator('iframe[name="gsft_main"]').contentFrame();
    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });

    // --- 4. Configure Properties in BigID Setup (with both fields updated) ---
    await page.getByRole('menuitem', { name: 'All' }).click();
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }
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