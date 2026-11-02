import { useMemo, useState } from 'react';
import { RefreshCw, Timer, Users, Activity } from 'lucide-react';
import { OperationStatsTable } from './DashboardShared';
import { formatDurationValue } from './dashboardFormatters';

const duration = (value, count = 1) => count > 0 && value !== null && value !== undefined && Number.isFinite(Number(value)) ? formatDurationValue(value) : '—';
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';

export default function GlobalOperationStatistics({ stats, error, refreshing, onRefresh, sessions = [], activeSessionCount = 0, onSelectSession, onShowSessions }) {
  const [metric, setMetric] = useState('averageSeconds');
  const [tab, setTab] = useState('operations');
  const [personSearch, setPersonSearch] = useState('');
  const [sort, setSort] = useState('name');
  const perPersonGroups = useMemo(() => {
    const groups = new Map();

    stats?.perPerson?.forEach((sessionStat) => {
      const traineeName =
        sessionStat.traineeName || 'Unknown Trainee';
      const existing = groups.get(traineeName);
      const sessionCount = Number(sessionStat.overall?.count) || 0;
      const sessionAvg = Number(sessionStat.overall?.averageSeconds) || 0;
      const sessionTotal = sessionCount * sessionAvg;

      if (!existing) {
        groups.set(traineeName, {
          traineeName,
          sessions: [],
          totalSeconds: 0,
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          operations: new Map()
        });
      }

      const group = groups.get(traineeName);
      group.sessions.push(sessionStat);
      group.totalSeconds += sessionTotal;
      group.count += sessionCount;
      group.minSeconds =
        group.minSeconds == null
          ? sessionStat.overall?.minSeconds
          : Math.min(
              group.minSeconds,
              sessionStat.overall?.minSeconds ?? Infinity
            );
      group.maxSeconds =
        group.maxSeconds == null
          ? sessionStat.overall?.maxSeconds
          : Math.max(
              group.maxSeconds,
              sessionStat.overall?.maxSeconds ?? 0
            );

      sessionStat.operations?.forEach((operation) => {
        const type = operation.type || 'Unknown operation';
        const opCount = Number(operation.count) || 0;
        const opAverage = Number(operation.averageSeconds) || 0;
        const opTotal = opCount * opAverage;

        if (!group.operations.has(type)) {
          group.operations.set(type, {
            type,
            count: 0,
            totalSeconds: 0,
            minSeconds: null,
            maxSeconds: null
          });
        }

        const opStats = group.operations.get(type);
        opStats.count += opCount;
        opStats.totalSeconds += opTotal;
        opStats.minSeconds =
          opStats.minSeconds == null
            ? operation.minSeconds
            : Math.min(
                opStats.minSeconds,
                operation.minSeconds ?? Infinity
              );
        opStats.maxSeconds =
          opStats.maxSeconds == null
            ? operation.maxSeconds
            : Math.max(
                opStats.maxSeconds,
                operation.maxSeconds ?? 0
              );
      });
    });

    return Array.from(groups.values()).map((group) => ({
      traineeName: group.traineeName,
      sessionCount: group.sessions.length,
      sessions: [...group.sessions].sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)),
      overall: {
        count: group.count,
        averageSeconds:
          group.count > 0
            ? group.totalSeconds / group.count
            : 0,
        minSeconds:
          group.minSeconds == null ? null : group.minSeconds,
        maxSeconds:
          group.maxSeconds == null ? null : group.maxSeconds
      },
      operations: Array.from(group.operations.values())
        .map((operation) => ({
          type: operation.type,
          count: operation.count,
          averageSeconds:
            operation.count > 0
              ? operation.totalSeconds / operation.count
              : 0,
          minSeconds: operation.minSeconds,
          maxSeconds: operation.maxSeconds,
          child: true
        }))
        .sort((a, b) => a.type.localeCompare(b.type))
    }));
  }, [stats?.perPerson]);


  if (!stats) return <div className="trainer-data-state" role="status"><h2>Operation performance</h2><p>{error || 'Loading operation statistics…'}</p>{error && <button type="button" onClick={onRefresh} disabled={refreshing}>Try again</button>}</div>;
  const rows = [...(stats.allOperations || [])].sort((a, b) => sort === 'value' ? (Number(b[metric]) || 0) - (Number(a[metric]) || 0) : a.type.localeCompare(b.type));
  const max = Math.max(1, ...rows.map((row) => Number(row[metric]) || 0));
  const ceiling = Math.max(metric === 'count' ? 5 : 1, Math.ceil(max / 5) * 5);
  const recentSessions = [...sessions].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)).slice(0, 5);
  const visiblePeople = perPersonGroups.filter((group) => group.traineeName.toLowerCase().includes(personSearch.trim().toLowerCase()));

  return <div className="trainer-performance">
    <header className="trainer-page-heading"><div><p className="trainer-breadcrumb">Statistics / All recorded sessions</p><h2>Operation performance</h2><p>Handling time and workload across trainee sessions.</p></div><button type="button" className="trainer-secondary-action" onClick={onRefresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'trainer-refreshing' : ''} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh statistics'}</button></header>
    <p className="trainer-data-scope">{stats.generatedAt ? 'Statistics updated ' + date(stats.generatedAt) : 'All available recorded data'} · Only operations with recorded handling time.</p>
    {error && <p className="trainer-inline-error" role="status">{error} Showing the last successful statistics.</p>}
    <div className="trainer-kpi-strip">
      {[['Timed operations', (stats.overall?.count || 0).toLocaleString(), Timer], ['Average handling', duration(stats.overall?.averageSeconds, stats.overall?.count || 0), Activity], ['Active sessions', activeSessionCount, Users]].map(([label, value, Icon]) => <div key={label}><span className="trainer-kpi-icon"><Icon size={24} aria-hidden="true" /></span><div><span>{label}</span><strong>{value}</strong></div></div>)}
    </div>
    <section className="trainer-surface" aria-label="Performance breakdown">
      <div className="trainer-section-heading"><div className="trainer-view-switch" role="group" aria-label="Statistics breakdown"><button type="button" aria-pressed={tab === 'operations'} onClick={() => setTab('operations')}>Operation comparison</button><button type="button" aria-pressed={tab === 'people'} onClick={() => setTab('people')}>By trainee</button></div>
      {tab === 'operations' && <div className="trainer-view-switch" role="group" aria-label="Comparison metric"><button type="button" aria-pressed={metric === 'averageSeconds'} onClick={() => setMetric('averageSeconds')}>Handling time</button><button type="button" aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>Volume</button></div>}</div>
      {tab === 'operations' ? <div className="trainer-comparison">
        <div className="trainer-comparison-tools"><p>{metric === 'count' ? 'Timed record count' : 'Average handling time'} · Shared scale across all operations</p><label>Order operations<select aria-label="Order operations" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="value">Highest value</option></select></label></div>
        {!rows.length ? <p className="trainer-empty-state">No timed operations recorded yet.</p> : <>
          <div className="trainer-comparison-labels"><span>Operation</span><span>{metric === 'count' ? 'Timed records' : 'Average duration'}</span><span>Value</span><span>Records</span></div>
          {rows.map((row) => <div className="trainer-comparison-row" key={row.type}><span className="trainer-operation-name">{row.type.replaceAll('_', ' ').toLowerCase()}</span><div className="trainer-comparison-track" role="img" aria-label={row.type + ': ' + (metric === 'count' ? row.count + ' timed records' : duration(row.averageSeconds, row.count))}><span style={{ width: Math.max(0, Math.min(100, (Number(row[metric]) || 0) / ceiling * 100)) + '%' }} /></div><strong>{metric === 'count' ? row.count : duration(row.averageSeconds, row.count)}</strong><span className="trainer-record-count">{row.count}</span></div>)}
          <div className="trainer-comparison-axis" aria-hidden="true"><span></span><div>{[0, 1, 2, 3, 4, 5].map((tick) => <span key={tick}>{Number((ceiling * tick / 5).toFixed(1))}{metric === 'averageSeconds' ? 's' : ''}</span>)}</div><span></span><span></span></div>
          <details className="trainer-timing-details"><summary>Detailed timings · average, fastest, slowest, and records</summary><OperationStatsTable rows={rows} /></details>
        </>}
      </div> : <div className="trainer-person-statistics"><label className="trainer-field">Find trainee timing<input type="search" value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="Entered trainee name" /></label><p className="trainer-data-scope">Grouped by entered name, not verified account identity. Averages are weighted by timed-operation count.</p>
        {!visiblePeople.length && <p className="trainer-empty-state">No trainee timing histories match.</p>}
        {visiblePeople.map((group) => <details className="trainer-person-timing" key={group.traineeName}><summary><span>{group.traineeName}</span><small>{group.sessionCount} sessions · {group.overall.count} timed records · {duration(group.overall.averageSeconds, group.overall.count)} average</small></summary><div className="trainer-person-detail"><OperationStatsTable rows={group.operations} /><h3>Session history</h3><div className="trainer-table-scroll"><table className="trainer-data-table"><thead><tr><th>Started</th><th>Timed records</th><th>Average</th><th>Session</th><th>Report</th></tr></thead><tbody>{group.sessions.map((session, index) => {
          const target = sessions.find((item) => item.id === session.sessionId);
          return <tr key={session.sessionId || index}><td>{date(session.startedAt)}</td><td>{session.overall?.count || 0}</td><td>{duration(session.overall?.averageSeconds, session.overall?.count || 0)}</td><td><code>{session.sessionId?.slice(0, 8) || 'Not linked'}</code></td><td>{target ? <button type="button" onClick={() => onSelectSession(target)}>View report</button> : 'Unavailable'}</td></tr>;
        })}</tbody></table></div></div></details>)}
      </div>}
    </section>
    <section className="trainer-surface" aria-labelledby="trainer-recent-title"><div className="trainer-section-heading"><div><h3 id="trainer-recent-title">Recent sessions</h3><p>Latest five sessions · all statuses</p></div><button type="button" className="trainer-text-action" onClick={onShowSessions}>All sessions →</button></div><div className="trainer-table-scroll"><table className="trainer-data-table"><thead><tr><th>Trainee</th><th>Started</th><th>Status</th><th>Session ID</th><th>Action</th></tr></thead><tbody>{recentSessions.map((session) => <tr key={session.id}><th scope="row">{session.trainee_name || 'Unknown trainee'}</th><td>{date(session.started_at)}</td><td><span className={'trainer-state-tag trainer-state-' + session.status}>{session.status}</span></td><td><code>{session.id.slice(0, 8)}</code></td><td><button type="button" onClick={() => onSelectSession(session)}>View report</button></td></tr>)}{!recentSessions.length && <tr><td colSpan="5">No sessions available.</td></tr>}</tbody></table></div></section>
  </div>;
}
