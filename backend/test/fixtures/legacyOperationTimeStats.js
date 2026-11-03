// Frozen reference of the pre-aggregation calculation, for parity verification.
export function legacyOperationTimeStats(rows) {
  const empty = () => ({ count: 0, totalSeconds: 0, minSeconds: null, maxSeconds: null });
  const add = (s, n) => { s.count++; s.totalSeconds += n; s.minSeconds = s.minSeconds == null ? n : Math.min(s.minSeconds, n); s.maxSeconds = s.maxSeconds == null ? n : Math.max(s.maxSeconds, n); };
  const final = (s) => ({ count: s.count, averageSeconds: Number((s.count ? s.totalSeconds / s.count : 0).toFixed(2)), minSeconds: s.minSeconds == null ? null : Number(s.minSeconds.toFixed(2)), maxSeconds: s.maxSeconds == null ? null : Number(s.maxSeconds.toFixed(2)) });
  const list = (m) => [...m].map(([type, s]) => ({ type, ...final(s) })).sort((a, b) => a.type.localeCompare(b.type));
  const overall = empty(), types = new Map(), people = new Map();
  for (const row of rows) {
    if (row.handling_time_seconds == null) continue;
    const n = Number(row.handling_time_seconds);
    if (!Number.isFinite(n)) continue;
    const type = row.type || 'UNKNOWN', session = row.session || {}, name = session.trainee_name || 'Unknown Trainee';
    const key = `${session.id || name}:${name}`;
    if (!types.has(type)) types.set(type, empty());
    if (!people.has(key)) people.set(key, { traineeName: name, sessionId: session.id, startedAt: session.started_at, overall: empty(), types: new Map() });
    const person = people.get(key);
    if (!person.types.has(type)) person.types.set(type, empty());
    for (const s of [overall, types.get(type), person.overall, person.types.get(type)]) add(s, n);
  }
  return { overall: final(overall), allOperations: list(types), perPerson: [...people.values()].map((p) => ({ traineeName: p.traineeName, sessionId: p.sessionId, startedAt: p.startedAt, overall: final(p.overall), operations: list(p.types) })).sort((a, b) => a.traineeName.localeCompare(b.traineeName)) };
}
