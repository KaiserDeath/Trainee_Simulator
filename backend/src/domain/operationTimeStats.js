function durationStats(stats) {
  if (!stats || !Number.isSafeInteger(stats.count) || stats.count < 0 || !Number.isFinite(stats.totalSeconds)
    || (stats.count > 0 && (!Number.isFinite(stats.minSeconds) || !Number.isFinite(stats.maxSeconds)))) {
    throw new Error('Invalid operation statistics summary.');
  }
  // Keep the existing JavaScript rounding contract, including binary-float ties.
  return {
    count: stats.count,
    averageSeconds: Number((stats.count ? stats.totalSeconds / stats.count : 0).toFixed(2)),
    minSeconds: stats.minSeconds == null ? null : Number(stats.minSeconds.toFixed(2)),
    maxSeconds: stats.maxSeconds == null ? null : Number(stats.maxSeconds.toFixed(2)),
  };
}

export function formatOperationTimeStats(data) {
  if (!data || !Array.isArray(data.allOperations) || !Array.isArray(data.perPerson)) {
    throw new Error('Invalid operation statistics summary.');
  }
  const operations = (rows) => rows.map((row) => ({ type: row.type, ...durationStats(row) }))
    .sort((a, b) => a.type.localeCompare(b.type));
  return {
    generatedAt: new Date().toISOString(),
    overall: durationStats(data.overall),
    allOperations: operations(data.allOperations),
    perPerson: data.perPerson.map((row) => ({
      traineeName: row.traineeName,
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      overall: durationStats(row.overall),
      operations: operations(row.operations),
    })).sort((a, b) => a.traineeName.localeCompare(b.traineeName)),
  };
}
