export const READ_ONLY_SCHEMA_INVENTORY = Object.freeze([
  Object.freeze({
    name: 'server_identity',
    sql: `SELECT current_database() AS database_name,
                 current_user AS database_user,
                 inet_server_addr()::text AS server_address,
                 inet_server_port() AS server_port,
                 version() AS server_version`,
  }),
  Object.freeze({
    name: 'tables',
    sql: `SELECT table_schema, table_name, table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name`,
  }),
  Object.freeze({
    name: 'columns',
    sql: `SELECT table_schema, table_name, ordinal_position, column_name,
                 data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name, ordinal_position`,
  }),
  Object.freeze({
    name: 'constraints',
    sql: `SELECT tc.table_schema, tc.table_name, tc.constraint_name,
                 tc.constraint_type
          FROM information_schema.table_constraints AS tc
          WHERE tc.table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`,
  }),
  Object.freeze({
    name: 'indexes',
    sql: `SELECT schemaname AS table_schema, tablename AS table_name,
                 indexname AS index_name, indexdef AS index_definition
          FROM pg_indexes
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY schemaname, tablename, indexname`,
  }),
  Object.freeze({
    name: 'row_level_security',
    sql: `SELECT schemaname AS table_schema, tablename AS table_name,
                 policyname AS policy_name, permissive, roles, cmd,
                 qual, with_check
          FROM pg_policies
          ORDER BY schemaname, tablename, policyname`,
  }),
]);

const DISALLOWED_SQL =
  /\b(ALTER|CALL|COPY|CREATE|DELETE|DO|DROP|EXECUTE|GRANT|INSERT|MERGE|REINDEX|REVOKE|TRUNCATE|UPDATE|VACUUM)\b/i;

export function assertReadOnlyInventory(queries = READ_ONLY_SCHEMA_INVENTORY) {
  const names = new Set();

  for (const query of queries) {
    if (!query?.name || typeof query.sql !== 'string') {
      throw new Error('Every inventory query must have a name and SQL string.');
    }
    if (names.has(query.name)) {
      throw new Error(`Duplicate inventory query name "${query.name}".`);
    }
    names.add(query.name);

    const normalized = query.sql.trim();
    if (!/^SELECT\b/i.test(normalized)) {
      throw new Error(`Inventory query "${query.name}" must begin with SELECT.`);
    }
    if (DISALLOWED_SQL.test(normalized)) {
      throw new Error(`Inventory query "${query.name}" is not read-only.`);
    }
    if (normalized.slice(0, -1).includes(';')) {
      throw new Error(`Inventory query "${query.name}" must be one statement.`);
    }
  }

  return queries;
}
