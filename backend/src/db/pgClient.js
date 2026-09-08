import pg from 'pg';

import { parseSelect } from './selectParser.js';
import { collectEmbedRequests, compileSelect } from './queryCompiler.js';
import { createRelationshipResolver } from './relationships.js';
import {
  Params,
  buildConflictClause,
  buildInsert,
  buildUpdateSet,
  compileFilters,
  quoteIdentifier,
} from './sqlBuilder.js';

// A drop-in replacement for the subset of the Supabase JS client this codebase
// uses, executing SQL directly against PostgreSQL. It exists so the ~156 query
// call sites do not have to be rewritten by hand; all of the translation risk
// lives here, where it can be tested against a real database.
//
// Results keep the { data, error } envelope. Errors are returned, never thrown,
// and carry the original SQLSTATE in `code` and the unmodified PostgreSQL
// message, because several call sites branch on '23505' and others match the
// message text.

const NUMERIC_TYPES = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric']);

function toError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || String(error),
    details: error.detail || null,
    hint: error.hint || null,
  };
}

function notFoundError() {
  // Mirrors PostgREST's shape for "single row expected, none found". Callers
  // only test truthiness of `error`, never this code, but keeping the code
  // stable avoids surprising anything that logs it.
  return {
    code: 'PGRST116',
    message: 'JSON object requested, multiple (or no) rows returned',
    details: null,
    hint: null,
  };
}

class QueryBuilder {
  constructor({ executor, schema, table, relationships }) {
    this.executor = executor;
    this.schema = schema;
    this.table = table;
    this.relationships = relationships;

    this.action = 'select';
    this.selectString = undefined;
    this.selectRequested = false;
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.payload = null;
    this.conflict = null;
    this.countMode = null;
    this.headMode = false;
    this.singleMode = null;
  }

  select(columns, options = {}) {
    this.selectRequested = true;
    this.selectString = columns;
    if (options.count) this.countMode = options.count;
    if (options.head) this.headMode = true;
    return this;
  }

  insert(rows) {
    this.action = 'insert';
    this.payload = rows;
    return this;
  }

  update(values) {
    this.action = 'update';
    this.payload = values;
    return this;
  }

  upsert(values, options = {}) {
    this.action = 'upsert';
    this.payload = values;
    this.conflict = {
      onConflict: options.onConflict || null,
      ignoreDuplicates: Boolean(options.ignoreDuplicates),
    };
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column, value) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  not(column, operator, value) {
    this.filters.push({ type: 'not', column, operator, value });
    return this;
  }

  or(filterString) {
    this.filters.push({ type: 'or', value: filterString });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  // The builder is lazily thenable: several call sites store a chain, extend it
  // conditionally, and only later await it or hand it to Promise.all.
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }

  finally(onFinally) {
    return this.execute().finally(onFinally);
  }

  async compile() {
    const qualified = `${quoteIdentifier(this.schema)}.${quoteIdentifier(this.table)}`;

    if (this.action === 'select') {
      const parsed = parseSelect(this.selectString);
      const requests = collectEmbedRequests(parsed, this.table);
      const resolved = new Map();

      for (const request of requests) {
        resolved.set(
          request.key,
          await this.relationships.resolve(
            request.parentTable,
            request.embed.table,
            request.embed.foreignKey,
          ),
        );
      }

      return compileSelect({
        schema: this.schema,
        table: this.table,
        parsed,
        filters: this.filters,
        orders: this.orders,
        limit: this.limitValue,
        relationships: resolved,
        count: this.countMode,
        head: this.headMode,
      });
    }

    const params = new Params();
    const returning = this.selectRequested
      ? ` RETURNING ${this.returningList()}`
      : '';

    if (this.action === 'insert') {
      const text = buildInsert({
        table: this.table,
        schema: this.schema,
        rows: this.payload,
        params,
      });
      return { text: `${text}${returning}`, values: params.values };
    }

    if (this.action === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const text = buildInsert({
        table: this.table,
        schema: this.schema,
        rows,
        params,
      });
      const conflict = buildConflictClause({
        onConflict: this.conflict.onConflict,
        ignoreDuplicates: this.conflict.ignoreDuplicates,
        values: rows[0],
        params,
      });
      return { text: `${text}${conflict}${returning}`, values: params.values };
    }

    if (this.action === 'update') {
      const set = buildUpdateSet(this.payload, params);
      const where = compileFilters(this.filters, params, () => quoteIdentifier(this.table));
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      return {
        text: `UPDATE ${qualified} AS ${quoteIdentifier(this.table)} SET ${set}${clause}${returning}`,
        values: params.values,
      };
    }

    const where = compileFilters(this.filters, params, () => quoteIdentifier(this.table));
    const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    return {
      text: `DELETE FROM ${qualified} AS ${quoteIdentifier(this.table)}${clause}${returning}`,
      values: params.values,
    };
  }

  returningList() {
    const parsed = parseSelect(this.selectString);
    if (parsed.embeds.length > 0) {
      throw new Error('Embedded selects are not supported on writes.');
    }
    if (parsed.columns.length === 0 || parsed.columns.includes('*')) return '*';
    return parsed.columns.map(quoteIdentifier).join(', ');
  }

  shape(rows) {
    if (this.headMode && this.countMode) {
      return { data: null, count: rows[0] ? rows[0].__count : 0, error: null };
    }

    // A write without .select() has nothing to return.
    if (this.action !== 'select' && !this.selectRequested) {
      return { data: null, error: null };
    }

    if (this.singleMode === 'single') {
      if (rows.length !== 1) return { data: null, error: notFoundError() };
      return { data: rows[0], error: null };
    }

    if (this.singleMode === 'maybe') {
      if (rows.length === 0) return { data: null, error: null };
      if (rows.length > 1) return { data: null, error: notFoundError() };
      return { data: rows[0], error: null };
    }

    return { data: rows, error: null };
  }

  async execute() {
    let compiled;
    try {
      compiled = await this.compile();
    } catch (error) {
      return { data: null, error: toError(error) };
    }

    try {
      const result = await this.executor(compiled.text, compiled.values);
      return this.shape(result.rows);
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }
}

function createFunctionSignatureLoader(executor) {
  const cache = new Map();

  return async function signature(name) {
    if (cache.has(name)) return cache.get(name);

    const result = await executor(
      `SELECT p.proname,
              COALESCE(p.proargnames, ARRAY[]::text[]) AS arg_names,
              ARRAY(
                SELECT format_type(t, NULL)
                FROM unnest(p.proargtypes) AS t
              ) AS arg_types
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = $1 AND n.nspname = 'public'
        LIMIT 1`,
      [name],
    );

    const row = result.rows[0] || null;
    cache.set(name, row);
    return row;
  };
}

export function createPgClient({ connectionString, pool: providedPool, schema = 'public' } = {}) {
  // Several call sites match PostgreSQL error text with English regexes, for
  // example /column .* does not exist/i in operationService. A server running a
  // non-English locale returns translated messages and those branches silently
  // stop matching, so pin messages to C. This is passed as a startup option
  // rather than a SET on connect: issuing that query from the pool's connect
  // handler races with the query the pool is already running on the connection.
  const pool =
    providedPool || new pg.Pool({ connectionString, options: '-c lc_messages=C' });

  const executor = (text, values) => pool.query(text, values);
  const relationships = createRelationshipResolver(executor);
  const loadSignature = createFunctionSignatureLoader(executor);

  function makeClient(activeSchema) {
    return {
      from(table) {
        return new QueryBuilder({
          executor,
          schema: activeSchema,
          table,
          relationships,
        });
      },

      schema(name) {
        return makeClient(name);
      },

      // PostgREST returns the bare value for scalar and composite returns, and
      // two helpers in this codebase differ on whether they unwrap arrays, so
      // the value must not be wrapped. to_jsonb gives one uniform shape:
      // composite rows become objects, JSONB passes through, integers stay
      // numbers.
      async rpc(name, params) {
        try {
          const signature = await loadSignature(name);
          if (!signature) {
            return {
              data: null,
              error: { code: '42883', message: `function ${name} does not exist`, details: null, hint: null },
            };
          }

          const supplied = params || {};
          const values = [];
          const args = [];

          signature.arg_names.forEach((argumentName, index) => {
            if (!(argumentName in supplied)) return;
            const type = signature.arg_types[index];
            values.push(normalizeArgument(supplied[argumentName], type));
            // Named notation keeps defaulted arguments optional and removes any
            // dependence on declaration order.
            args.push(`${quoteIdentifier(argumentName)} => $${values.length}::${type}`);
          });

          const call = `${quoteIdentifier(name)}(${args.join(', ')})`;
          const result = await executor(`SELECT to_jsonb(${call}) AS result`, values);
          return { data: result.rows[0] ? result.rows[0].result : null, error: null };
        } catch (error) {
          return { data: null, error: toError(error) };
        }
      },

      async end() {
        if (!providedPool) await pool.end();
      },

      // Exposed for tests and diagnostics.
      _pool: pool,
      _relationships: relationships,
    };
  }

  return makeClient(schema);
}

// Callers hand JSON.stringify(...) strings to some functions and plain objects
// to others; PostgREST coerced both. An explicit cast plus a normalized value
// keeps jsonb and text parameters working from the same call sites.
function normalizeArgument(value, type) {
  if (value === undefined) return null;

  if ((type === 'jsonb' || type === 'json') && typeof value !== 'string') {
    return JSON.stringify(value);
  }

  if (NUMERIC_TYPES.has(type) && typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }

  return value;
}
