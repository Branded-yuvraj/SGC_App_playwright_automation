// bigid `type` -> ServiceNow CI class, per the Application Design doc's
// CI Classes table, corrected against real API data (dynamodb-v2, not dynamodb)
const BIGID_TYPE_TO_CI_CLASS = {
    'rdb-mysql': 'cmdb_ci_db_mysql_instance',
    'rdb-postgresql': 'cmdb_ci_db_postgresql_instance',
    'rdb-db2': 'cmdb_ci_db_db2_instance',
    'rdb-mssql': 'cmdb_ci_db_mssql_instance',
    'rdb-oracle': 'cmdb_ci_db_ora_instance',
    'rdb-sybase': 'cmdb_ci_db_syb_instance',
    'rdb-redshift': 'cmdb_ci_aws_redshift',
    'dynamodb-v2': 'cmdb_ci_dynamodb_table',
    's3-v2': 'cmdb_ci_aws_s3_endpoint',
    'smb_v2': 'cmdb_ci_file_system_smb',   
    'nfs_v2': 'cmdb_ci_file_system_nfs',   
};

// Types with a dedicated ServiceNow catalog table (per design doc)
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

function resolveCiClass(bigidType) {
    return BIGID_TYPE_TO_CI_CLASS[bigidType] || null; // null = unsupported/unknown type
}

function isStructured(bigidType) {
    return STRUCTURED_WITH_CATALOG_TABLE.has(bigidType);
}

module.exports = { BIGID_TYPE_TO_CI_CLASS, STRUCTURED_WITH_CATALOG_TABLE, INSTANCE_TO_CATALOG_TABLE, resolveCiClass, isStructured };