// Compiles a parsed select plus filters into SQL.
//
// Embedded resources become correlated subqueries returning JSON rather than
// flat joins: a many-to-one embed yields an object, a one-to-many embed yields
// an array, and nesting is then simply recursion. Flat joins would need row
// de-duplication and would collide on aliases once embeds nest two deep.

import {
  Params,
  compileFilters,
  compileOrder,
  quoteIdentifier,
  splitFilterTarget,
} from './sqlBuilder.js';

function aliasFactory() {
  let counter = 0;
  return () => {
    counter += 1;
    return `t${counter}`;
  };
}

function joinCondition(relationship, parentAlias, childAlias) {
  const { kind, foreignKey } = relationship;
  const pairs = [];

  for (let index = 0; index < foreignKey.sourceColumns.length; index += 1) {
    const sourceColumn = quoteIdentifier(foreignKey.sourceColumns[index]);
    const targetColumn = quoteIdentifier(foreignKey.targetColumns[index]);

    if (kind === 'many-to-one') {
      // Parent holds the foreign key.
      pairs.push(`${childAlias}.${targetColumn} = ${parentAlias}.${sourceColumn}`);
    } else {
      // Child holds the foreign key.
      pairs.push(`${childAlias}.${sourceColumn} = ${parentAlias}.${targetColumn}`);
    }
  }

  return pairs.join(' AND ');
}

function embedColumnList(embed, alias, nestedExpressions) {
  const parts = [];

  for (const column of embed.columns) {
    if (column === '*') parts.push(`${alias}.*`);
    else parts.push(`${alias}.${quoteIdentifier(column)}`);
  }

  parts.push(...nestedExpressions);
  if (parts.length === 0) parts.push(`${alias}.*`);
  return parts.join(', ');
}

/**
 * Builds the JSON-producing expression for one embed, recursing into nested
 * embeds. `embedFilters` are filters written as "<alias>.<column>".
 */
function compileEmbed({
  embed,
  parentAlias,
  parentTable,
  schema,
  params,
  relationships,
  embedFilters,
  nextAlias,
}) {
  const relationship = relationships.get(embedKey(parentTable, embed));
  const alias = nextAlias();
  const target = relationship.foreignKey;
  const targetTable = relationship.kind === 'many-to-one' ? target.targetTable : target.sourceTable;
  const targetSchema = relationship.kind === 'many-to-one' ? target.targetSchema : target.sourceSchema;

  const nested = embed.embeds.map((child) => {
    const expression = compileEmbed({
      embed: child,
      parentAlias: alias,
      parentTable: targetTable,
      schema: targetSchema,
      params,
      relationships,
      embedFilters,
      nextAlias,
    });
    return `${expression} AS ${quoteIdentifier(child.alias)}`;
  });

  const conditions = [joinCondition(relationship, parentAlias, alias)];

  const own = (embedFilters.get(embed.alias) || []).concat(embedFilters.get(embed.table) || []);
  if (own.length > 0) {
    conditions.push(...compileFilters(own, params, () => alias));
  }

  const inner =
    `SELECT ${embedColumnList(embed, alias, nested)} ` +
    `FROM ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} ${alias} ` +
    `WHERE ${conditions.join(' AND ')}`;

  if (relationship.kind === 'many-to-one') {
    return `(SELECT to_jsonb(e) FROM (${inner} LIMIT 1) e)`;
  }

  return `(SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM (${inner}) e)`;
}

function embedKey(parentTable, embed) {
  return `${parentTable}:${embed.table}:${embed.foreignKey || ''}`;
}

/**
 * Collects every (parentTable, embed) pair so relationships can be resolved
 * before compilation, which keeps compilation synchronous.
 */
export function collectEmbedRequests(parsed, baseTable) {
  const requests = [];

  const walk = (node, parentTable) => {
    for (const embed of node.embeds) {
      requests.push({ parentTable, embed, key: embedKey(parentTable, embed) });
      // The child's own table becomes the parent for anything nested inside.
      walk(embed, embed.table);
    }
  };

  walk(parsed, baseTable);
  return requests;
}

export function compileSelect({
  schema,
  table,
  parsed,
  filters,
  orders,
  limit,
  relationships,
  count,
  head,
}) {
  const params = new Params();
  const base = 't0';
  const nextAlias = aliasFactory();

  // Filters naming an embed are applied inside that embed's subquery. Every
  // such filter in this codebase sits on an !inner embed, so the parent row is
  // also constrained by an EXISTS below.
  const embedNames = new Set();
  const collect = (node) => {
    for (const embed of node.embeds) {
      embedNames.add(embed.alias);
      embedNames.add(embed.table);
      collect(embed);
    }
  };
  collect(parsed);

  const baseFilters = [];
  const embedFilters = new Map();

  for (const filter of filters) {
    if (filter.type === 'or') {
      baseFilters.push(filter);
      continue;
    }

    const { embed } = splitFilterTarget(filter.column);
    if (embed && embedNames.has(embed)) {
      const list = embedFilters.get(embed) || [];
      list.push({ ...filter, column: splitFilterTarget(filter.column).column });
      embedFilters.set(embed, list);
      continue;
    }

    baseFilters.push(filter);
  }

  const embedExpressions = parsed.embeds.map((embed) => {
    const expression = compileEmbed({
      embed,
      parentAlias: base,
      parentTable: table,
      schema,
      params,
      relationships,
      embedFilters,
      nextAlias,
    });
    return `${expression} AS ${quoteIdentifier(embed.alias)}`;
  });

  const columns = [];
  for (const column of parsed.columns) {
    if (column === '*') columns.push(`${base}.*`);
    else columns.push(`${base}.${quoteIdentifier(column)}`);
  }
  if (columns.length === 0 && embedExpressions.length > 0) columns.push(`${base}.*`);
  if (columns.length === 0) columns.push(`${base}.*`);

  const where = compileFilters(baseFilters, params, () => base);

  // An !inner embed must also remove parent rows that have no match.
  for (const embed of parsed.embeds) {
    if (!embed.inner) continue;

    const relationship = relationships.get(embedKey(table, embed));
    const alias = nextAlias();
    const targetTable =
      relationship.kind === 'many-to-one'
        ? relationship.foreignKey.targetTable
        : relationship.foreignKey.sourceTable;
    const targetSchema =
      relationship.kind === 'many-to-one'
        ? relationship.foreignKey.targetSchema
        : relationship.foreignKey.sourceSchema;

    const conditions = [joinCondition(relationship, base, alias)];
    const own = (embedFilters.get(embed.alias) || []).concat(embedFilters.get(embed.table) || []);
    if (own.length > 0) conditions.push(...compileFilters(own, params, () => alias));

    where.push(
      `EXISTS (SELECT 1 FROM ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} ` +
        `${alias} WHERE ${conditions.join(' AND ')})`,
    );
  }

  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const from = ` FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} ${base}`;

  if (head && count) {
    return { text: `SELECT count(*)::int AS "__count"${from}${whereClause}`, values: params.values };
  }

  const orderClause = compileOrder(orders, () => base);
  const limitClause = limit === null || limit === undefined ? '' : ` LIMIT ${Number(limit)}`;
  const selectList = [...columns, ...embedExpressions].join(', ');

  return {
    text: `SELECT ${selectList}${from}${whereClause}${orderClause}${limitClause}`,
    values: params.values,
  };
}
