import {useHubLocale} from '../../i18n/HubLocaleContext';
export default function HubReportBreakdown({ statistics = {} }) {
  const {t} = useHubLocale();
  return <div className="hub-report-breakdowns">
    {statistics.disposedEvidencePackets>0&&<p>{statistics.disposedEvidencePackets}{t(" attempt(s) have disposed detailed evidence. Scores remain recorded; operation and failure breakdowns cover retained evidence only.")}</p>}
    {[
      ['By operation type', statistics.accuracyByOperationType],
      ['By game', statistics.accuracyByGame],
      ['By category', statistics.accuracyByCategory],
    ].map(([title, values]) => <details key={title}><summary>{t(title)}</summary>
      {Object.keys(values || {}).length ? <div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Group")}</th><th>{t("Correct")}</th><th>{t("Total")}</th><th>{t("Accuracy")}</th></tr></thead><tbody>{Object.entries(values).map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{value.correct ?? '—'}</td><td>{value.total ?? '—'}</td><td>{value.accuracy === null || value.accuracy === undefined ? '—' : `${value.accuracy}%`}</td></tr>)}</tbody></table></div> : <p>{t("No operation results available for these filters.")}</p>}
    </details>)}
    <details><summary>{t("Failure breakdown")}</summary>{Object.keys(statistics.failureBreakdown || {}).length ? <ul className="hub-history-results">{Object.entries(statistics.failureBreakdown).sort((a, b) => b[1] - a[1]).map(([reason, count]) => <li key={reason}><span>{t(reason)}</span><strong>{count}{t(" occurrences")}</strong></li>)}</ul> : <p>{t("No recorded failures for these filters.")}</p>}</details>
    <details><summary>{t("Progress over time")}</summary>{statistics.progressOverTime?.length ? <div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Date (UTC)")}</th><th>{t("Attempts")}</th><th>{t("Passed")}</th><th>{t("Average score")}</th></tr></thead><tbody>{statistics.progressOverTime.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.attempts}</td><td>{day.passed}</td><td>{day.averageScore === null || day.averageScore === undefined ? '—' : `${day.averageScore}%`}</td></tr>)}</tbody></table></div> : <p>{t("No completed attempts available for these filters.")}</p>}</details>
  </div>;
}
