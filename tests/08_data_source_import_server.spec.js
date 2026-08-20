import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('TC-010 - API-Driven Server creation & Dynamic Instance Verification', async ({ page }) => {
    test.setTimeout(300_000);

    const snUrl = process.env.SN_URL;
    const testAssetName = process.env.IMPORT_JOB_RDB_DATASOURCE;   // e.g., MSSQL
    const testAssetServer = process.env.IMPORT_JOB_RDB_SERVER;     // e.g., MSSQL SERVER 69
    const rdbType = process.env.IMPORT_JOB_RDB_TYPE;               // e.g., MSSQL
    const rdbUrl = process.env.RDB_URL;                            // e.g., bigid-mssql.cabt0fxz03bw.us-east-1.rds.amazonaws.com

    const supportedDbTypes = [
        'MYSQL',
        'POSTGRESQL',
        'DB2',
        'MSFT SQL',
        'MSSQL',
        'ORACLE',
        'SYBASE'
    ];

    // Map database types to their corresponding ServiceNow table names
    const dbTableMapping = {
        'MYSQL': 'cmdb_ci_db_mysql_instance',
        'POSTGRESQL': 'cmdb_ci_db_postgresql_instance',
        'DB2': 'cmdb_ci_db_db2_instance',
        'MSFT SQL': 'cmdb_ci_db_mssql_instance',
        'MSSQL': 'cmdb_ci_db_mssql_instance',
        'ORACLE': 'cmdb_ci_db_ora_instance',
        '_AWSORACLE': 'cmdb_ci_db_ora_instance',
        'SYBASE': 'cmdb_ci_db_syb_instance'
    };

    const targetTableName = dbTableMapping[rdbType.toUpperCase()] || 'cmdb_ci_db_mysql_instance';
    console.log(`[Automation] Resolved target table for ${rdbType}: ${targetTableName}`);

    await page.goto(snUrl);
    await page.waitForTimeout(3_000);

    page.on('console', msg => {
        if (msg.text().includes('[API Automation]')) {
            console.log(msg.text());
        }
    });

    console.log(`Starting API setup for Database Type: ${rdbType}, Server: ${testAssetServer}`);

    // --- 1. Automatic Server Creation via API using Parsed RDB_URL ---
    const shouldCreateServer = supportedDbTypes.includes(rdbType.toUpperCase());

    if (shouldCreateServer && testAssetServer) {
        await page.evaluate(async ({ serverName, dbURL }) => {
            const token = window.g_ck || (window.top && window.top.g_ck) || '';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserToken': token
            };

            function isIpAddress(str) {
                const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                return ipv4Regex.test(str);
            }

            function parseDBURL(urlStr) {
                if (undefined === urlStr || !urlStr) return {};
                let res = urlStr.split("://");
                res = res[res.length - 1];
                let server = res.split(":")[0];
                let host = null;
                let ip_address = null;
                let port = null;
                if (server && server !== "null") {
                    if (isIpAddress(server)) {
                        ip_address = server;
                    } else {
                        host = server;
                    }
                }
                port = res.split(":");
                port = port.length > 1 ? port[1] : null;
                let db_name = null;
                if (port) {
                    if (port.includes("/") || port.includes(";")) {
                        db_name = port.split(/\/|\;/)[1].split(/(\/|\?|\;)/)[0];
                        db_name = db_name.includes("=") ? db_name.split("=")[1] : db_name;
                        port = port.split(/\/|\;/)[0];
                    }
                } else {
                    if (res.includes("/") || res.includes(";")) {
                        db_name = res.split(/\/|\;/)[1].split(/(\/|\?|\;)/)[0];
                        db_name = db_name.includes("=") ? db_name.split("=")[1] : db_name;
                        host = res.split(/\/|\;/)[0];
                    }
                }
                return {
                    "ip_address": ip_address,
                    "host": host,
                    "port": port,
                    "additional_param": db_name
                };
            }

            const parsedDetails = parseDBURL(dbURL);
            console.log(`[API Automation] Parsed RDB URL details: ${JSON.stringify(parsedDetails)}`);

            const parentClass = 'cmdb_ci_server';
            console.log(`[API Automation] Checking if Server CI exists: "${serverName}"`);
            
            const getRes = await fetch(`/api/now/table/${parentClass}?sysparm_query=name=${encodeURIComponent(serverName)}&sysparm_limit=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const getData = await getRes.json();

            if (getData.result && getData.result.length > 0) {
                console.log(`[API Automation] Server CI already exists with sys_id: ${getData.result[0].sys_id}`);
            } else {
                console.log(`[API Automation] Server not found. Creating new server record...`);
                
                const serverPayload = { name: serverName };
                if (parsedDetails.ip_address) {
                    serverPayload.ip_address = parsedDetails.ip_address;
                }
                if (parsedDetails.host) {
                    serverPayload.host_name = parsedDetails.host;
                }

                const createRes = await fetch(`/api/now/table/${parentClass}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(serverPayload)
                });
                const createData = await createRes.json();
                if (createRes.ok && createData.result) {
                    console.log(`[API Automation] Successfully created Server CI with sys_id: ${createData.result.sys_id}`);
                } else {
                    console.log(`[API Automation] ERROR creating Server CI: ${JSON.stringify(createData)}`);
                }
            }
        }, { serverName: testAssetServer, dbURL: rdbUrl });
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

    expect(instanceCreated, `The database instance "${testAssetName}" was not found in the "${targetTableName}" table`).toBeTruthy();
});