# SGC for BigID — Playwright Smoke Test Suite

Automated end-to-end smoke tests for the Service Graph Connector (SGC) for BigID ServiceNow
application. Covers credentials setup, configuration validation, scheduled data source imports
(RDB, Logical Datacenter, and Storage Server variants), data catalog import verification, and
data source export — driven by a CSV of real and synthetic test data so the suite scales to
however many data sources you're testing against, without editing code per run.

## 1. Getting the project

```bash
git clone <repo-url>
cd <repo-folder>
npm install
npx playwright install --with-deps chromium
```

## 2. Configure environment

Copy the example env file and fill in real values:

```bash
cp .env.example .env
```

Required variables:

```dotenv
SN_USER=admin
SN_PASS=your_servicenow_password
SN_URL=https://your-instance.service-now.com/

BIGID_ROOT_URL=https://your-tenant.bigid.cloud/
BIGID_API_KEY=your_bigid_api_key
```

## 3. Populate test data (`test-data/dataSource.csv`)

The suite reads all its per-scenario test data from `test-data/dataSource.csv`. Each row is
tagged with a `SCRIPT_NO` that tells the matching numbered test file which rows belong to it.

**Import-side rows (07, 08, 09) can be auto-generated from real BigID connections using SGC_playwright\utils\populate_from_BIGID_V2.js:**

```bash
node utils/populate_from_BIGID.js
```

This authenticates against BigID (exchanges `BIGID_API_KEY` for a session token via
`/api/v1/refresh-access-token`), pulls every connection from `/api/v1/ds-connections`, fetches
each one's detail (`/api/v1/ds_connections/{name}`) for connection-specific fields like
`rdb_url`, classifies each by type, and **upserts** rows into the CSV — safely re-running this
won't duplicate rows or disturb manually-maintained ones (script numbers 01–06, 15–17).

**Export-side rows (15, 16, 17) are NOT auto-generated** — those tests verify ServiceNow → BigID
export, which needs invented/synthetic CI names that don't exist yet in BigID. Maintain those
rows by hand directly in the CSV. The script does produce them in servicenow however their configuration must be present in the CSV

`SCRIPT_NO` legend:

| SCRIPT_NO | Test file | Purpose |
| 00 | `00_login_and_save_session` | Auth setup (runs automatically first) |
| 01 | `01_scheduled_import_job_invalid_config_run` | Import job with no connection configured |
| 02 | `02_credential_setup` | Save valid BigID credentials |
| 03 | `03_configuration_classificationgrp_setup` | Valid classification group |
| 04 | `04_configuration_empty_invalid_classification_group` | Invalid classification group (negative) |
| 05 | `05_configuration_invalidbatchsize` | Invalid batch size (negative) |
| 06 | `06_bulk_data_source_import` | Bulk import of data sources without creating server or ci record |
| 07 | `07_data_source_import_server` | RDB data source import (needs a Server CI) |
| 08 | `08_data_source_import_ldc` | S3 / Redshift / DynamoDB / SMB / NFS import (Logical Datacenter) |
| 09 | `09_data_source_import_storage_server` | SMB / NFS import (Storage Server variant) |
| 10 | `10_configuration_emptydatasourcefield` | Empty data source field (Imports all) |
| 11–13 | `11-13_scheduled_catalog_import_prerequisite_script_*` | CI Class Manager Key-Value setup (S3, File System, Storage File Share) |
| 14 | `14_scheduled_import_job_catalog` | Data Catalog import verification |
| 15 | `15_export_functionality_rdb_apiscript` | RDB export |
| 16 | `16_export_functionality_ldc_apiscript` | LDC-based export (S3/Redshift/DynamoDB/SMB/NFS) |
| 17 | `17_export_functionality_ss_apiscript` | Storage Server export |

## 4. Connector-side script change (required once per ServiceNow instance)

The Data Catalog Import background script (used by the **BigID Data Catalogs Import** scheduled
job) only logs a `Datasource=...` summary line for **structured** sources by default —
unstructured sources (S3, SMB, NFS) are processed but never appear in the log, which the test
suite's log-parsing step (`14_scheduled_import_job_catalog`) depends on to discover which data
sources were actually imported.

To make unstructured sources show up in the log too, apply the following script in ServiceNow studio
inside the data-catalog import script

```javascript
(function loadData(import_set_table, data_source, import_log, last_success_import_time) {

    var logger = new x_biid_sgc_integ.BigIDLogger();
    var importStats = {};
    logger.info("BigID Data Catalogs Import", "Data Loader Script", "Start");
    
    try {
        var dcUtils = new x_biid_sgc_integ.DataCatalogUtils();
        var boUtils = new x_biid_sgc_integ.BusinessOperationsUtility();
        var config_functions = new x_biid_sgc_integ.ConfigFunctions();
        var apiUtil = new x_biid_sgc_integ.BigIDSGAPIUtility();
        var configRec = config_functions.getConfigRecord();
        
        if (configRec == null) {
            logger.error("BigID Data Catalogs Import", "Data Loader Script", "Configuration details not found. Please check the application configuration settings.");
            return;
        }
        
        var config = config_functions.getConfig(configRec);
        var classificationGroup = config.classificationGroup;
        
        // Define the expected tag name based on the stored classification group
        var expectedTagName = 'system.sensitivityClassification.' + classificationGroup;

        var classificationLevels = [];
        var grpFilter = [{
            field: "name",
            value: classificationGroup,
            operator: "equal"
        }];
        var levels = apiUtil.fetchClassificationGrpLevels(JSON.stringify(grpFilter));

        if (!levels.success) {
            logger.error("BigID Data Catalogs Import", "Data Loader Script", "The API request failed for endpoint: /aci/sc/configs with error: " + levels.message);
            return;
        }

        if (!levels.result.hasOwnProperty('data') ||
            !levels.result.data.hasOwnProperty('scConfigs') ||
            levels.result.data.scConfigs.length == 0 ||
            !levels.result.data.scConfigs[0].hasOwnProperty('classifications') ||
            levels.result.data.scConfigs[0].classifications.length == 0) {
            logger.error("BigID Data Catalogs Import", "Data Loader Script", "The configured classification group '" + classificationGroup + "' does not exist in the BigID platform.");
            return;
        }

        for (var j = 0; j < levels.result.data.scConfigs[0].classifications.length; j++) {
            classificationLevels = classificationLevels.concat(
                levels.result.data.scConfigs[0].classifications[j].name
            );
        }

        var _dsConnections = [];
        var dsMap = {};
        var allSupportedTypes = boUtils.supportedDBTypes.concat(boUtils.unstructuredDBTypes);

        var importDSFilter = [{
            "field": "type",
            "value": allSupportedTypes,
            "operator": "in"
        }, {
            "field": "connectionStatusTest.is_success",
            "value": true,
            "operator": "equals"
        }, {
            "field": "custom_fields.field_name",
            "value": "servicenow_id_" + gs.getProperty("instance_name"),
            "operator": "equals"
        }, {
            "field": "custom_fields.field_name",
            "value": "servicenow_dbname_" + gs.getProperty("instance_name"),
            "operator": "equals"
        }, {
            "field": "archived",
            "value": [false, null],
            "operator": "in"
        }];

        _dsConnections = boUtils.fetchDataSources(importDSFilter);

        if (_dsConnections.length == 0) {
            logger.error("BigID Data Catalogs Import", "Data Loader Script", "No data sources found in the BigID.");
            return;
        }

        // Process data sources and filter by matching classification group tag
        _dsConnections.forEach(function (ds) {
            var columnMapping = {};
            if (ds && ds.hasOwnProperty("name")) {
                if (!boUtils.unstructuredDBTypes.includes(ds.type)) {
                    dsMap[ds.name] = ds;
                } else {
                    if (ds.hasOwnProperty("tags") && ds.tags.length !== 0) {
                        var tagKVPair = dcUtils.getClassificationTagKV(ds.tags);
                        
                        // Validate if the imported tag matches the expected classification group tag name
                        if (tagKVPair && tagKVPair.tagName === expectedTagName) {
                            columnMapping['u_key'] = tagKVPair.tagName;
                            columnMapping['u_value'] = tagKVPair.tagValue;
                            columnMapping['u_db_type'] = ds.type;
                            columnMapping['u_sys_class_name'] = boUtils._getSnDbType(ds.type);
                            var snowCustomParams = dcUtils.getSNCustomParams(ds);
                            
                            if (snowCustomParams) {
                                columnMapping['u_db_sysid'] = snowCustomParams.sn_sysID;
                                columnMapping['u_database_instance'] = snowCustomParams.sn_dbName;
                                import_set_table.insert(columnMapping);

                                if (!importStats[ds.name]) {
                                    importStats[ds.name] = {
                                        count: 0,
                                        category: "Unstructured",
                                        bigidType: ds.type,
                                        ciClass: boUtils._getSnDbType(ds.type)
                                    };
                                }
                                importStats[ds.name].count++;
                            }
                        }
                    }
                }
            }
        });

        if (Object.keys(dsMap).length === 0) {
            return;
        }

        var _dataCatalogsLimit = parseInt(config.batchSize);
        var _dataCatalogs;
        var datasourceNameList = Object.keys(dsMap);
        var invalidDatasources = [];

        for (var dsIndex = 0; dsIndex < datasourceNameList.length; dsIndex++) {
            var currentDataSource = datasourceNameList[dsIndex];
            if (!importStats[currentDataSource]) {
                var dsType = dsMap[currentDataSource].type;
                importStats[currentDataSource] = {
                    count: 0,
                    category: "Structured",
                    bigidType: dsType,
                    ciClass: boUtils._getSnDbType(dsType)
                };
            }

            var dataCatalogFilter = `catalog_tag.system.sensitivityClassification.${classificationGroup} IN (${classificationLevels}) AND system = "${currentDataSource}"`;
            var fetchMore = true;
            var _dataCatalogsSkip = 0;

            while (fetchMore) {
                var _dataCatalogsResponse = apiUtil.fetchDataCatalogs(dataCatalogFilter, _dataCatalogsLimit, _dataCatalogsSkip);

                if (!_dataCatalogsResponse.success) {
                    logger.error("BigID Data Catalogs Import", "Data Loader Script", "An error occurred while fetching catalogs for datasource: " + currentDataSource + ". Details=" + JSON.stringify(_dataCatalogsResponse.message));
                    return;
                }

                if (!_dataCatalogsResponse.result.hasOwnProperty("results")) {
                    logger.error("BigID Data Catalogs Import", "Data Loader Script", "An error occurred while accessing catalog results for datasource: " + currentDataSource + ". Details=" + JSON.stringify(_dataCatalogsResponse.result));
                    return;
                }

                var totalCatalogCount = _dataCatalogsResponse.result.results?.length;

                if (totalCatalogCount < _dataCatalogsLimit) {
                    fetchMore = false;
                }

                _dataCatalogs = _dataCatalogsResponse.result.results;

                if (_dataCatalogs.length == 0) {
                    logger.info("BigID Data Catalogs Import", "Data Loader Script", "No data catalog found for datasource: " + currentDataSource);
                } else {
                    for (var i = 0; i < _dataCatalogs.length; i++) {
                        if (boUtils.isSupportedBiidType(_dataCatalogs[i].type)) {
                            var dcObject = _dataCatalogs[i];

                            // Validate that catalog tags contain the exact matching classification group tag name
                            var isValidTagMatch = false;
                            var tagKVPair = null;

                            if (dcObject.hasOwnProperty("tags") && dcObject.tags.length > 0) {
                                tagKVPair = dcUtils.getClassificationTagKV(dcObject.tags);
                                if (tagKVPair && tagKVPair.tagName === expectedTagName) {
                                    isValidTagMatch = true;
                                }
                            }

                            // Skip processing/logging if the tag doesn't match the configured group
                            if (!isValidTagMatch) {
                                continue;
                            }

                            if (importStats[currentDataSource]) {
                                importStats[currentDataSource].count++;
                            }

                            var dsInfo = dcUtils.getValidatedSnowDsInfo(dcObject, dsMap);
                            if (dsInfo.success) {
                                var dbName = dsInfo.dsName;
                                var snClassName = "";
                                if (dcObject.hasOwnProperty("type")) {
                                    if (dcObject.type === 'rdb-oracle' && dsInfo.isPDB)
                                        snClassName = "cmdb_ci_db_ora_pdb_instance";
                                    else
                                        snClassName = boUtils._getSnDbType(dcObject.type);
                                }
                                if (importStats[currentDataSource]) {
                                    importStats[currentDataSource].ciClass = snClassName;
                                }
                                var record = {
                                    'u_catalog_name': dcObject.hasOwnProperty("fullyQualifiedName") ? dcObject["fullyQualifiedName"] : "",
                                    'u_database_instance': dbName,
                                    'u_db_sysid': dsInfo.dbSysId,
                                    'u_db_type': dcObject.hasOwnProperty("type") ? dcObject["type"] : "",
                                    'u_sys_class_name': snClassName,
                                    'u_db_schema_name': dsInfo.schemaName,
                                    'u_key': tagKVPair.tagName,
                                    'u_value': tagKVPair.tagValue
                                };

                                if (dcObject.hasOwnProperty("attribute") && dcObject.attribute.length != 0) {
                                    for (var k in dcObject.attribute) {
                                        record['u_info_obj'] = dcObject.attribute[k];
                                        import_set_table.insert(record);
                                    }
                                } else {
                                    import_set_table.insert(record);
                                }
                            } else {
                                if (!invalidDatasources.includes(dcObject.source)) {
                                    invalidDatasources.push(dcObject.source);
                                    logger.error("BigID Data Catalogs Import", "Data Loader Script", "The " + dcObject.source + " either has missing custom parameters or does not exist in the ServiceNow CMDB");
                                }
                            }
                        }
                    }
                }

                _dataCatalogsSkip += _dataCatalogsLimit;
            }
        }
    } catch (err) {
        logger.error("BigID Data Catalogs Import", "Data Loader Script", "Details=" + err);
    }

    logger.info("BigID Data Catalogs Import", "Data Loader Script", "========== IMPORT SUMMARY ==========");

    for (var ds in importStats) {
        logger.info(
            "BigID Data Catalogs Import",
            "Data Loader Script",
            "Datasource=" + ds +
            ", Category=" + importStats[ds].category +
            ", BigID Type=" + importStats[ds].bigidType +
            ", CI Class=" + importStats[ds].ciClass +
            ", Catalog Count=" + importStats[ds].count
        );
    }
    logger.info("BigID Data Catalogs Import", "Data Loader Script", "End");

})(import_set_table, data_source, import_log, last_success_import_time);
```

Note: `Catalog Count` means something slightly different for unstructured sources than
structured ones — there's no catalog-fetch loop for them, so each successfully-processed
unstructured source just shows `Catalog Count=1` (presence, not a real count of catalog
entries).

## 5. Running the full smoke suite

```bash
npx playwright test --workers 1 --headed // headed for watching it run real time , 1 worker ensures that there is no clash between accessing resources in servicenow.
```

That's it — one command runs everything, in order:

1. `login_and_save_session` authenticates once and saves the session for every other test to
   reuse (configured as a Playwright setup project dependency).
2. Numbered test files execute in ascending order (`00` → `17`), each pulling its own rows from
   `dataSource.csv` by `SCRIPT_NO` and generating one Playwright test per matching row.

**Useful variants:**

```bash
npx playwright test 07_data_source_import_server.spec.js --headed   # run just one numbered file
npx playwright test --headed                        # watch it run in a real browser
npx playwright show-report                           # view the last HTML report
```

