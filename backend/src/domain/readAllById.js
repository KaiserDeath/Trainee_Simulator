// Traverse the provider's capped pages in stable primary-key order. This is a
// live read, not a transaction snapshot. Never publish partial totals on error.
export async function readAllById(queryFactory, { pageSize = 250, maxRows = 100000 } = {}) {
  const rows = [];
  let cursor;
  for (;;) {
    let query = queryFactory().order('id', { ascending: true }).limit(pageSize);
    if (cursor !== undefined) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Invalid paginated read response.');
    if (data.length === 0) return rows;
    for (const row of data) {
      if (typeof row.id !== 'string' || (cursor !== undefined && row.id <= cursor)) {
        throw new Error('Paginated read did not advance in primary-key order.');
      }
      cursor = row.id;
      rows.push(row);
      if (rows.length > maxRows) throw new Error('Complete report exceeds the supported row budget.');
    }
  }
}
