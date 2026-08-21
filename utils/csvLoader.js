const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { resolveCiClass, isStructured } = require('./ciClassMapping');

function loadDataSources(csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(raw, {
        columns: true,
        skip_empty_lines: true,

    });

    const supported = [];
    const skipped = [];

    for (const row of records) {
        const bigidType = row['Type']?.trim();
        const ciClass = resolveCiClass(bigidType);

        if (!ciClass) {
            skipped.push({ name: row['Name'], type: bigidType, reason: 'unsupported type' });
            continue;
        }

        supported.push({
            datasource: row['Name'],
            bigidType,
            ciClass,
            hasCatalogTable: isStructured(bigidType),
        });
    }

    if (skipped.length > 0) {
        console.log(`Skipped ${skipped.length} unsupported data source(s):`, skipped);
    }

    return supported;
}

module.exports = { loadDataSources };