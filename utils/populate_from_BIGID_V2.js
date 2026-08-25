/**
 * Populates dataSource.csv rows for SCRIPT_NO 07 (RDB import), 08 (LDC import),
 * and 09 (storage-server import) directly from real BigID connections.
 * 
 * Usage: node utils/populateFromBigID.js
 * Requires BIGID_ROOT_URL and BIGID_API_KEY in .env
 */

const fs = require('fs');
const path = require('path');
require('dotenv/config');

const BIGID_ROOT_URL = process.env.BIGID_ROOT_URL?.replace(/\/$/, '');
const BIGID_API_KEY = process.env.BIGID_API_KEY;
const CSV_PATH = path.join(__dirname, '../test-data/dataSource.csv');

const RDB_TYPES = new Set([
    'rdb-mysql', 'rdb-postgresql', 'rdb-db2', 'rdb-mssql', 'rdb-oracle', 'rdb-sybase',
]);

// rdb-redshift remains here under LDC types so it maps to SCRIPT_NO '08' for your Playwright test
const LDC_TYPES = new Set([
    's3-v2', 'dynamodb-v2', 'rdb-redshift', 'smb_v2', 'nfs_v2',
]);

const TYPE_LABELS = {
    'rdb-mysql': 'MYSQL',
    'rdb-postgresql': 'POSTGRESQL',
    'rdb-db2': 'DB2',
    'rdb-mssql': 'MSSQL',
    'rdb-oracle': 'ORACLE',
    'rdb-sybase': 'SYBASE',
    'rdb-redshift': 'REDSHIFT',
    's3-v2': 'S3-V2',
    'dynamodb-v2': 'DYNAMODB',
    'smb_v2': 'SMB',
    'nfs_v2': 'NFS',
};

const CSV_COLUMNS = [
    'SCRIPT_NO', 'CLASSIFICATION_GROUP_NAME',
    'IMPORT_JOB_RDB_DATASOURCE', 'IMPORT_JOB_RDB_SERVER', 'IMPORT_JOB_RDB_TYPE', 'RDB_URL',
    'IMPORT_JOB_LDC_DATASOURCE', 'IMPORT_JOB_LDC', 'IMPORT_JOB_LDC_TYPE', 'IMPORT_JOB_LDC_DNS_DOMAIN',
    'IMPORT_JOB_SS_DATASOURCE', 'IMPORT_JOB_SS', 'IMPORT_JOB_SS_TYPE', 'IMPORT_JOB_SS_IP_ADDRESS',
    'EXPORT_SERVER_INSTANCE', 'EXPORT_SERVER_NAME', 'EXPORT_SERVER_CI_CLASS',
    'EXPORT_LDC_DATASOURCE', 'EXPORT_LDC_DATACENTER', 'EXPORT_LDC_CI_CLASS',
    'EXPORT_STORAGESERVER_DATASOURCE', 'EXPORT_STORAGESERVER_SERVER', 'EXPORT_STORAGE_TYPE', 'EXPORT_FILESHARE_KEYWORD',
];

function blankRow() {
    const row = {};
    for (const col of CSV_COLUMNS) row[col] = '';
    return row;
}

function csvEscape(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Removes the trailing port number (e.g., :5439, :1521) from an address/URL string.
 */
function removePort(address) {
    if (!address) return '';
    return address.replace(/:\d+$/, '');
}

async function getSystemToken() {
    console.log('Authenticating and exchanging API key for a BigID session token...');
    const res = await fetch(`${BIGID_ROOT_URL}/api/v1/refresh-access-token`, {
        method: 'GET',
        headers: { Authorization: BIGID_API_KEY },
    });
    if (!res.ok) {
        throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.systemToken) {
        throw new Error(`Token exchange response missing systemToken: ${JSON.stringify(data)}`);
    }
    return data.systemToken;
}

async function fetchAllConnections(token) {
    const res = await fetch(`${BIGID_ROOT_URL}/api/v1/ds-connections`, {
        headers: { Authorization: token },
    });
    if (!res.ok) throw new Error(`ds-connections list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.data.ds_connections;
}

async function fetchConnectionDetail(name, token) {
    const encodedName = encodeURIComponent(name);
    const res = await fetch(
        `${BIGID_ROOT_URL}/api/v1/ds_connections/${encodedName}?shouldKeepDisabledCustomFields=true&withoutCredentialValue=true`,
        { headers: { Authorization: token } }
    );
    if (!res.ok) {
        console.warn(`  [WARN] Detail fetch failed for "${name}": ${res.status}`);
        return null;
    }
    const data = await res.json();
    return data.ds_connection;
}

async function main() {
    if (!BIGID_ROOT_URL || !BIGID_API_KEY) {
        throw new Error('BIGID_ROOT_URL and BIGID_API_KEY must be set in .env');
    }

    const sessionToken = await getSystemToken();

    console.log('Fetching all connections from BigID...');
    const connections = await fetchAllConnections(sessionToken);
    console.log(`Found ${connections.length} total connections.`);

    const newRows = [];

    for (const conn of connections) {
        const { name, type } = conn;
        const isRdb = RDB_TYPES.has(type);
        const isLdc = LDC_TYPES.has(type);

        if (!isRdb && !isLdc) continue;

        console.log(`Fetching detail for "${name}" (${type})...`);
        const detail = await fetchConnectionDetail(name, sessionToken);
        if (!detail) continue;

        // --- ROBUST CONNECTION VALIDATION ---
        const statusObj = detail.connectionStatusTest || detail.connectionStatusScan;
        const statusDetails = detail.enrichmentFields?.statusDetails?.status;

        // 1. Skip if an explicit test/scan ran and failed
        if (statusObj && statusObj.is_success === false) {
            console.log(` -> Skipping "${name}": Connection status/test failed.`);
            continue;
        }

        // 2. Skip if it's in a Draft, ConnectionError, or Failed state
        if (['Draft', 'ConnectionError', 'Failed'].includes(statusDetails)) {
            console.log(` -> Skipping "${name}": Status is "${statusDetails}".`);
            continue;
        }

        // 3. Optional: Skip if there is no connection test/scan record at all yet
        if (!statusObj) {
            console.log(` -> Skipping "${name}": No connection test or scan record found.`);
            continue;
        }
        // 

        // For Redshift, use rdb_url if available, otherwise fall back to resourceAddress, and strip port if present
        let addressValue = '';
        if (type === 'rdb-redshift') {
            addressValue = removePort(detail.rdb_url || detail.resourceProperties?.resourceAddress || '');
        } else {
            addressValue = detail.resourceProperties?.resourceAddress || '';
        }

        if (isRdb) {
            const row = blankRow();
            row.SCRIPT_NO = '07';
            row.IMPORT_JOB_RDB_DATASOURCE = name;
            row.IMPORT_JOB_RDB_SERVER = `${name.replace(/\s+/g, '_')}_server`;
            row.IMPORT_JOB_RDB_TYPE = TYPE_LABELS[type] || type.toUpperCase();
            row.RDB_URL = removePort(detail.rdb_url || '');
            newRows.push(row);
        } else if (isLdc) {
            const row08 = blankRow();
            row08.SCRIPT_NO = '08';
            row08.IMPORT_JOB_LDC_DATASOURCE = name;
            row08.IMPORT_JOB_LDC = `${name.replace(/\s+/g, '_')}_ldc`;
            row08.IMPORT_JOB_LDC_TYPE = TYPE_LABELS[type] || type.toUpperCase();
            row08.IMPORT_JOB_LDC_DNS_DOMAIN = addressValue;
            newRows.push(row08);

            if (type === 'smb_v2' || type === 'nfs_v2') {
                const row09 = blankRow();
                row09.SCRIPT_NO = '09';
                row09.IMPORT_JOB_SS_DATASOURCE = name;
                row09.IMPORT_JOB_SS = `${name.replace(/\s+/g, '_')}_ss`;
                row09.IMPORT_JOB_SS_TYPE = TYPE_LABELS[type] || type.toUpperCase();
                row09.IMPORT_JOB_SS_IP_ADDRESS = addressValue;
                newRows.push(row09);
            }
        }
    }

    let existingHeader = CSV_COLUMNS.join(',');
    const existingDataMap = new Map();

    if (fs.existsSync(CSV_PATH)) {
        const fileContent = fs.readFileSync(CSV_PATH, 'utf-8').trim();
        if (fileContent) {
            const lines = fileContent.split(/\r?\n/);
            existingHeader = lines[0];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                
                const firstCommaIndex = line.indexOf(',');
                let scriptNo = firstCommaIndex !== -1 ? line.substring(0, firstCommaIndex).replace(/^"|"$/g, '').trim() : '';

                if (['07', '08', '09'].includes(scriptNo)) {
                    const cols = line.split(','); 
                    const rdbDs = cols[2]?.replace(/^"|"$/g, '').trim();
                    const ldcDs = cols[6]?.replace(/^"|"$/g, '').trim();
                    const ssDs = cols[10]?.replace(/^"|"$/g, '').trim();
                    const dsName = rdbDs || ldcDs || ssDs;

                    if (dsName) {
                        existingDataMap.set(`${scriptNo}_${dsName}`, line);
                        continue;
                    }
                }

                existingDataMap.set(`preserved_line_${i}`, line);
            }
        }
    }

    for (const row of newRows) {
        const scriptNo = row.SCRIPT_NO;
        const dsName = row.IMPORT_JOB_RDB_DATASOURCE || row.IMPORT_JOB_LDC_DATASOURCE || row.IMPORT_JOB_SS_DATASOURCE;
        
        if (scriptNo && dsName) {
            const uniqueKey = `${scriptNo}_${dsName}`;
            const formattedLine = CSV_COLUMNS.map((col) => csvEscape(row[col])).join(',');
            existingDataMap.set(uniqueKey, formattedLine);
        }
    }

    const allLines = [existingHeader, ...existingDataMap.values()];
    fs.writeFileSync(CSV_PATH, allLines.join('\r\n') + '\r\n', 'utf-8');

    console.log(`\nDone. Upserted rows into test file: ${CSV_PATH}`);
}

main().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});