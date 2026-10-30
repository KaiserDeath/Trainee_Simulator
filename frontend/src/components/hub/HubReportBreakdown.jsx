export default function HubReportBreakdown({ statistics = {} }) {
  return <div className="hub-report-breakdowns">
    {[
      ['By operation type', statistics.accuracyByOperationType],
      ['By game', statistics.accuracyByGame],
      ['By category', statistics.accuracyByCategory],
    ].map(([title, values]) => <details key={title}><summary>{title}</summary>
      {Object.keys(values || {}).length ? <div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Group</th><th>Correct</th><th>Total</th><th>Accuracy</th></tr></thead><tbody>{Object.entries(values).map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{value.correct ?? '—'}</td><td>{value.total ?? '—'}</td><td>{value.accuracy === null || value.accuracy === undefined ? '—' : `${value.accuracy}%`}</td></tr>)}</tbody></table></div> : <p>No operation results available for these filters.</p>}
    </details>)}
    <details><summary>Failure breakdown</summary>{Object.keys(statistics.failureBreakdown || {}).length ? <ul className="hub-history-results">{Object.entries(statistics.failureBreakdown).sort((a, b) => b[1] - a[1]).map(([reason, count]) => <li key={reason}><span>{reason}</span><strong>{count} occurrences</strong></li>)}</ul> : <p>No recorded failures for these filters.</p>}</details>
    <details><summary>Progress over time</summary>{statistics.progressOverTime?.length ? <div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Date (UTC)</th><th>Attempts</th><th>Passed</th><th>Average score</th></tr></thead><tbody>{statistics.progressOverTime.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.attempts}</td><td>{day.passed}</td><td>{day.averageScore === null || day.averageScore === undefined ? '—' : `${day.averageScore}%`}</td></tr>)}</tbody></table></div> : <p>No completed attempts available for these filters.</p>}</details>
  </div>;
}
