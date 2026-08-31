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
| 07 | `07_data_source_import_server` | RDB data source import (needs a Server CI , if not present creates one for you) |
| 08 | `08_data_source_import_ldc` | S3 / Redshift / DynamoDB / SMB / NFS import (Logical Datacenter ,if not present creates one for you) |
| 09 | `09_data_source_import_storage_server` | SMB / NFS import (Storage Server variant,if not present creates one for you) |
| 10 | `10_configuration_emptydatasourcefield` | Empty data source field (Imports all) |
| 11–13 | `11-13_scheduled_catalog_import_prerequisite_script_*` | CI Class Manager Key-Value setup (S3, File System, Storage File Share) |
| 14 | `14_scheduled_import_job_catalog` | Data Catalog import verification |
| 15 | `15_export_functionality_rdb_apiscript` | RDB export |
| 16 | `16_export_functionality_ldc_apiscript` | LDC-based export (S3/Redshift/DynamoDB/SMB/NFS) |
| 17 | `17_export_functionality_ss_apiscript` | Storage Server export |



## 4. Running the full smoke suite

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

