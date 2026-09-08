// SQL construction for the pg-backed query builder. Kept separate from the
// builder so the compilation can be tested without a database.

// PostgREST filter values arrive as strings; identifiers are interpolated
// because table and column names are dynamic in a few call sites and cannot be
// parameterized. Every identifier goes through this.
export function quoteIdentifier(name) {
  const value = String(name);
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

export function quoteQualified(reference) {
  return String(reference)
    .split('.')
    .map(quoteIdentifier)
    .join('.');
}

export class Params {
  constructor() {
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

// PostgREST's .or() takes "col.op.value,col.op.value". Only ilike appears in
// this codebase, but the parser handles the general shape so a new caller
// fails loudly rather than silently matching everything.
const OR_OPERATORS = new Map([
  ['eq', '='],
  ['neq', '<>'],
  ['gt', '>'],
  ['gte', '>='],
  ['lt', '<'],
  ['lte', '<='],
  ['like', 'LIKE'],
  ['ilike', 'ILIKE'],
]);

export function compileOrFilter(filterString, params, alias) {
  const clauses = String(filterString)
    .split(',')
    .filter((part) => part.trim() !== '')
    .map((part) => {
      const first = part.indexOf('.');
      const second = part.indexOf('.', first + 1);
      if (first === -1 || second === -1) {
        throw new Error(`Unsupported or() filter segment: ${part}`);
      }

      const column = part.slice(0, first);
      const operator = part.slice(first + 1, second);
      const value = part.slice(second + 1);
      const sqlOperator = OR_OPERATORS.get(operator);
      if (!sqlOperator) {
        throw new Error(`Unsupported or() operator: ${operator}`);
      }

      return `${alias}.${quoteIdentifier(column)} ${sqlOperator} ${params.add(value)}`;
    });

  if (clauses.length === 0) throw new Error('or() requires at least one filter.');
  return `(${clauses.join(' OR ')})`;
}

function compileNot(filter, params, alias) {
  const column = `${alias}.${quoteIdentifier(filter.column)}`;

  if (filter.operator === 'is') {
    if (filter.value !== null) {
      throw new Error("not(column, 'is', value) supports only null.");
    }
    return `${column} IS NOT NULL`;
  }

  const sqlOperator = OR_OPERATORS.get(filter.operator);
  if (!sqlOperator) throw new Error(`Unsupported not() operator: ${filter.operator}`);
  // NOT (col op value) rather than col NOT op value, so NULLs behave as
  // PostgREST does: a NULL column does not satisfy a negated filter.
  return `NOT (${column} ${sqlOperator} ${params.add(filter.value)})`;
}

// Filters naming an embedded resource ("hub_roles.code") apply to the joined
// table, not the base table.
export function splitFilterTarget(column) {
  const index = String(column).lastIndexOf('.');
  if (index === -1) return { embed: null, column: String(column) };
  return {
    embed: String(column).slice(0, index),
    column: String(column).slice(index + 1),
  };
}

export function compileFilters(filters, params, resolveAlias) {
  const clauses = [];

  for (const filter of filters) {
    if (filter.type === 'or') {
      clauses.push(compileOrFilter(filter.value, params, resolveAlias(null)));
      continue;
    }

    const { embed, column } = splitFilterTarget(filter.column);
    const alias = resolveAlias(embed);
    const target = `${alias}.${quoteIdentifier(column)}`;

    if (filter.type === 'not') {
      clauses.push(compileNot({ ...filter, column }, params, alias));
      continue;
    }

    if (filter.type === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      // An empty IN list must match nothing rather than raise a syntax error.
      if (values.length === 0) {
        clauses.push('FALSE');
        continue;
      }
      clauses.push(`${target} = ANY(${params.add(values)})`);
      continue;
    }

    if (filter.value === null) {
      clauses.push(filter.type === 'neq' ? `${target} IS NOT NULL` : `${target} IS NULL`);
      continue;
    }

    const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    const sqlOperator = operators[filter.type];
    if (!sqlOperator) throw new Error(`Unsupported filter: ${filter.type}`);
    clauses.push(`${target} ${sqlOperator} ${params.add(filter.value)}`);
  }

  return clauses;
}

export function compileOrder(orders, resolveAlias) {
  if (orders.length === 0) return '';
  const parts = orders.map((order) => {
    const { embed, column } = splitFilterTarget(order.column);
    const alias = resolveAlias(embed);
    const direction = order.ascending === false ? 'DESC' : 'ASC';
    // PostgREST puts nulls last on ascending order by default.
    const nulls = order.ascending === false ? 'NULLS FIRST' : 'NULLS LAST';
    return `${alias}.${quoteIdentifier(column)} ${direction} ${nulls}`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

export function buildInsert({ table, schema, rows, params }) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) throw new Error('insert() requires at least one row.');

  const columns = [...new Set(list.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) throw new Error('insert() requires at least one column.');

  const tuples = list.map((row) => {
    const values = columns.map((column) =>
      row[column] === undefined ? 'DEFAULT' : params.add(row[column]),
    );
    return `(${values.join(', ')})`;
  });

  return (
    `INSERT INTO ${quoteIdentifier(schema)}.${quoteIdentifier(table)} ` +
    `(${columns.map(quoteIdentifier).join(', ')}) VALUES ${tuples.join(', ')}`
  );
}

export function buildUpdateSet(values, params) {
  const columns = Object.keys(values);
  if (columns.length === 0) throw new Error('update() requires at least one column.');
  return columns
    .map((column) => `${quoteIdentifier(column)} = ${params.add(values[column])}`)
    .join(', ');
}

export function buildConflictClause({ onConflict, ignoreDuplicates, values, params }) {
  const target = onConflict
    ? `(${String(onConflict)
        .split(',')
        .map((column) => quoteIdentifier(column.trim()))
        .join(', ')})`
    : '';

  if (ignoreDuplicates) return ` ON CONFLICT ${target} DO NOTHING`;

  const assignments = Object.keys(values)
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ');

  // Without an explicit target PostgreSQL cannot infer the arbiter index, so
  // fall back to DO NOTHING rather than guessing a primary key.
  if (!target) return ' ON CONFLICT DO NOTHING';
  return ` ON CONFLICT ${target} DO UPDATE SET ${assignments}`;
}
