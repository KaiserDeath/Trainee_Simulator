// Resolves how two tables are related, so an embedded select can become a SQL
// join. Read from the live catalog rather than hardcoded, because several
// relationships are composite and three call sites disambiguate by naming the
// foreign key constraint explicitly.

const FOREIGN_KEY_QUERY = `
  SELECT
    constraint_name::text AS constraint_name,
    source_schema::text AS source_schema,
    source_table::text AS source_table,
    array_agg(source_column::text ORDER BY ordinality) AS source_columns,
    target_schema::text AS target_schema,
    target_table::text AS target_table,
    array_agg(target_column::text ORDER BY ordinality) AS target_columns
  FROM (
    SELECT
      c.conname AS constraint_name,
      sn.nspname AS source_schema,
      s.relname  AS source_table,
      sa.attname AS source_column,
      tn.nspname AS target_schema,
      t.relname  AS target_table,
      ta.attname AS target_column,
      k.ordinality
    FROM pg_constraint c
    JOIN pg_class s      ON s.oid = c.conrelid
    JOIN pg_namespace sn ON sn.oid = s.relnamespace
    JOIN pg_class t      ON t.oid = c.confrelid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(src, tgt, ordinality) ON TRUE
    JOIN pg_attribute sa ON sa.attrelid = c.conrelid AND sa.attnum = k.src
    JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = k.tgt
    WHERE c.contype = 'f'
      AND sn.nspname NOT IN ('pg_catalog', 'information_schema')
  ) AS expanded
  GROUP BY constraint_name, source_schema, source_table, target_schema, target_table
`;

export async function loadForeignKeys(query) {
  const result = await query(FOREIGN_KEY_QUERY, []);
  return result.rows.map((row) => ({
    constraintName: row.constraint_name,
    sourceSchema: row.source_schema,
    sourceTable: row.source_table,
    sourceColumns: row.source_columns,
    targetSchema: row.target_schema,
    targetTable: row.target_table,
    targetColumns: row.target_columns,
  }));
}

/**
 * Given a base table and an embedded table, decide the join.
 *
 * many-to-one: the base table holds the foreign key, so the embed yields a
 * single object. one-to-many: the embedded table holds it, so the embed yields
 * an array.
 */
export function resolveRelationship(foreignKeys, baseTable, embedTable, explicitConstraint) {
  if (explicitConstraint) {
    const named = foreignKeys.find((key) => key.constraintName === explicitConstraint);
    if (!named) {
      throw new Error(`Unknown foreign key constraint: ${explicitConstraint}`);
    }

    if (named.sourceTable === baseTable && named.targetTable === embedTable) {
      return { kind: 'many-to-one', foreignKey: named };
    }
    if (named.sourceTable === embedTable && named.targetTable === baseTable) {
      return { kind: 'one-to-many', foreignKey: named };
    }

    throw new Error(
      `Constraint ${explicitConstraint} does not relate ${baseTable} to ${embedTable}.`,
    );
  }

  const manyToOne = foreignKeys.filter(
    (key) => key.sourceTable === baseTable && key.targetTable === embedTable,
  );
  const oneToMany = foreignKeys.filter(
    (key) => key.sourceTable === embedTable && key.targetTable === baseTable,
  );

  // Ambiguity must fail loudly: silently picking a foreign key would join on
  // the wrong column and quietly return the wrong rows.
  if (manyToOne.length + oneToMany.length === 0) {
    throw new Error(`No foreign key relates ${baseTable} to ${embedTable}.`);
  }

  if (manyToOne.length + oneToMany.length > 1) {
    const names = [...manyToOne, ...oneToMany].map((key) => key.constraintName).join(', ');
    throw new Error(
      `Ambiguous relationship between ${baseTable} and ${embedTable}. ` +
        `Name one of: ${names}`,
    );
  }

  return manyToOne.length === 1
    ? { kind: 'many-to-one', foreignKey: manyToOne[0] }
    : { kind: 'one-to-many', foreignKey: oneToMany[0] };
}

export function createRelationshipResolver(query) {
  let cache = null;

  return {
    async resolve(baseTable, embedTable, explicitConstraint) {
      if (!cache) cache = await loadForeignKeys(query);
      return resolveRelationship(cache, baseTable, embedTable, explicitConstraint);
    },
    async all() {
      if (!cache) cache = await loadForeignKeys(query);
      return cache;
    },
    reset() {
      cache = null;
    },
  };
}
