import {useHubLocale} from '../../i18n/HubLocaleContext';
const STATUS_LABELS = {
  assigned: 'Assigned',
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  abandoned: 'Abandoned',
  active: 'Active',
  submitted: 'Submitted',
};

const labelStatus = (status) => STATUS_LABELS[status] || status || 'Unknown';

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function LineageNotice({ lineage, compact = false }) {
  const {t} = useHubLocale();
  const linked = lineage?.status === 'linked';
  return (
    <p className={`hub-lineage ${linked ? 'is-linked' : 'is-unlinked'}`}>
      <strong>{linked ? t("Explicit Hub link") : t("Unlinked legacy simulator session")}</strong>
      {!compact && (
        <span>
          {linked
            ? t("Identity linkage comes only from a durable Hub attempt reference.")
            : t("The legacy participant name is a historical label only; no Hub identity is inferred.")}
        </span>
      )}
    </p>
  );
}

function PageControls({ label, pageInfo, canGoBack, onPrevious, onNext }) {
  const {t} = useHubLocale();
  if (!canGoBack && !pageInfo?.nextCursor) return null;
  return (
    <nav className="hub-audit-pagination" aria-label={t("{0} pages", [label])}>
      <button type="button" disabled={!canGoBack} onClick={onPrevious}>{t("Previous")}</button>
      <button type="button" disabled={!pageInfo?.nextCursor} onClick={onNext}>{t("Next")}</button>
    </nav>
  );
}

function AttemptSummary({ attempt, onSelectAttempt }) {
  const {t} = useHubLocale();
  return (
    <li>
      <span>{t("Attempt ")}{attempt.attemptNumber || '—'}</span>
      <span>{labelStatus(attempt.status)}</span>
      <LineageNotice lineage={attempt.lineage} compact />
      <button type="button" onClick={() => onSelectAttempt(attempt.id)}>{t("View evidence")}</button>
    </li>
  );
}

function LearnerSummary({ trainee, onSelectTrainee }) {
  const {t} = useHubLocale();
  const identity = trainee.identity || {};
  return (
    <article className="hub-audit-card">
      <header>
        <div>
          <p className="hub-eyebrow">{t("Hub Postulante")}</p>
          <h3>{identity.displayName || t("Unnamed Hub identity")}</h3>
        </div>
        <span className="hub-status">{labelStatus(identity.status)}</span>
      </header>
      <button type="button" onClick={() => onSelectTrainee(identity.id)}>{t("View learning record")}</button>
    </article>
  );
}

function LearningRecordReport({ record, history, onPrevious, onNext, onSelectAttempt }) {
  const {t} = useHubLocale();
  if (!record) return null;
  const modules = record.moduleRecords || [];
  const attempts = record.attempts || [];
  const pageInfo = record.pageInfo || {};
  return (
    <section className="hub-audit-report" aria-labelledby="hub-learning-record-title">
      <p className="hub-eyebrow">{t("Read-only Hub progress")}</p>
      <h3 id="hub-learning-record-title">{t("Postulante module record")}</h3>
      <p>{record.postulante?.displayName || t("Unnamed Hub identity")}</p>
      <div className="hub-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}>
        <table className="hub-trainer-table">
          <caption>{t("Module completion status")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Course")}</th>
              <th scope="col">{t("Module")}</th>
              <th scope="col">{t("Enrolment")}</th>
              <th scope="col">{t("Module status")}</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((recordItem) => (
              <tr key={`${recordItem.enrolment?.id}-${recordItem.module?.id}`}>
                <th scope="row">{t(recordItem.course?.title || t("Untitled course"))}</th>
                <td>{t(recordItem.module?.title || t("Untitled module"))}</td>
                <td>{labelStatus(recordItem.enrolment?.status)}</td>
                <td>{labelStatus(recordItem.module?.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageControls
        label={t("Module completion record")}
        pageInfo={pageInfo.moduleRecords}
        canGoBack={history.moduleCursor.length > 0}
        onPrevious={() => onPrevious('moduleRecords')}
        onNext={() => onNext('moduleRecords')}
      />
      <section className="hub-audit-enrolment">
        <h4>{t("Attempt summaries")}</h4>
        {attempts.length ? (
          <ul className="hub-audit-attempts">
            {attempts.map((attempt) => (
              <AttemptSummary key={attempt.id} attempt={attempt} onSelectAttempt={onSelectAttempt} />
            ))}
          </ul>
        ) : <p className="hub-empty-state">{t("No Hub attempts were returned.")}</p>}
      </section>
      <PageControls
        label={t("Hub attempt summary")}
        pageInfo={pageInfo.attempts}
        canGoBack={history.attemptCursor.length > 0}
        onPrevious={() => onPrevious('attempts')}
        onNext={() => onNext('attempts')}
      />
    </section>
  );
}

function KeyValueReport({ title, value }) {
  const {t}=useHubLocale();
  const entries = value && typeof value === 'object' ? Object.entries(value) : [];
  if (!entries.length) return null;
  return (
    <section className="hub-audit-metrics">
      <h4>{t(title)}</h4>
      <dl>
        {entries.map(([key, item]) => (
          <div key={key}>
            <dt>{key.replaceAll('_', ' ')}</dt>
            <dd>{displayValue(item)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FailurePoint({ failure }) {
  const {t} = useHubLocale();
  if (!failure || typeof failure !== 'object') return displayValue(failure);
  return (
    <>
      <strong>{t(failure.label || t("Validation failure"))}</strong>
      <span>{t("Expected: ")}{displayValue(failure.expected)}</span>
      <span>{t("Reported: ")}{displayValue(failure.sent)}</span>
    </>
  );
}

function OperationReport({ report, history, onPrevious, onNext }) {
  const {t} = useHubLocale();
  if (!report) return null;
  const session = report.session || {};
  return (
    <section className="hub-audit-report" aria-labelledby="hub-operation-report-title">
      <p className="hub-eyebrow">{t("Read-only simulator evidence")}</p>
      <h3 id="hub-operation-report-title">{t("Operation and failure report")}</h3>
      <p>{t("Legacy session label: ")}<strong>{session.traineeName || t("Unnamed legacy session")}</strong></p>
      <LineageNotice lineage={session.lineage} />
      <div className="hub-audit-metric-grid">
        <KeyValueReport title={t("Performance")} value={report.performance} />
        <KeyValueReport title={t("Operation breakdown")} value={report.operationBreakdown} />
      </div>
      <div className="hub-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}>
        <table className="hub-trainer-table">
          <caption>{t("Sanitized operation outcomes and validation failures")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Operation")}</th>
              <th scope="col">{t("Status")}</th>
              <th scope="col">{t("Result")}</th>
              <th scope="col">{t("Failure points")}</th>
            </tr>
          </thead>
          <tbody>
            {(report.operations || []).map((operation) => (
              <tr key={operation.id}>
                <th scope="row">{t(operation.type)}</th>
                <td>{labelStatus(operation.status)}</td>
                <td>{displayValue(operation.sentResult ?? operation.expectedResult)}</td>
                <td>
                  {operation.failurePoints?.length ? (
                    <ul className="hub-audit-failures">
                      {operation.failurePoints.map((failure, index) => (
                        <li key={`${operation.id}-failure-${index}`}>
                          <FailurePoint failure={failure} />
                        </li>
                      ))}
                    </ul>
                  ) : t("No reported failure points")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageControls
        label={t("Simulator operation")}
        pageInfo={report.pageInfo?.operations}
        canGoBack={history.operationCursor.length > 0}
        onPrevious={() => onPrevious('operations')}
        onNext={() => onNext('operations')}
      />
      <section className="hub-audit-log" aria-labelledby="hub-audit-log-title">
        <h4 id="hub-audit-log-title">{t("Action audit log")}</h4>
        {(report.auditLog || []).length ? (
          <ol>
            {report.auditLog.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.actionType}</strong>
                <span>{entry.timestamp}</span>
                {entry.details && <span>{displayValue(entry.details)}</span>}
              </li>
            ))}
          </ol>
        ) : <p>{t("No audit actions were returned.")}</p>}
      </section>
      <PageControls
        label={t("Simulator audit action")}
        pageInfo={report.pageInfo?.auditLog}
        canGoBack={history.actionCursor.length > 0}
        onPrevious={() => onPrevious('auditLog')}
        onNext={() => onNext('auditLog')}
      />
    </section>
  );
}

function EvidenceTable({ title, caption, rows, renderRow, columns }) {
  const {t} = useHubLocale();
  return (
    <section className="hub-audit-evidence-section">
      <h4>{t(title)}</h4>
      {rows.length ? (
        <div className="hub-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}>
          <table className="hub-trainer-table">
            <caption>{caption}</caption>
            <thead>
              <tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        </div>
      ) : <p className="hub-empty-state">{t("No records were returned for this evidence category.")}</p>}
    </section>
  );
}

function AttemptEvidenceReport({ attempt, history, onPrevious, onNext }) {
  const {t} = useHubLocale();
  if (!attempt) return null;
  const summary = attempt.attempt || {};
  const activities = attempt.activityAttempts || [];
  const events = attempt.evidenceEvents || [];
  const artifacts = attempt.artifacts || [];
  const pageInfo = attempt.pageInfo || {};

  return (
    <section className="hub-audit-report" aria-labelledby="hub-attempt-evidence-title">
      <p className="hub-eyebrow">{t("Read-only Hub evidence")}</p>
      <h3 id="hub-attempt-evidence-title">{t("Attempt evidence")}</h3>
      <p>{t("Attempt ")}{summary.attemptNumber || '—'} · {labelStatus(summary.status)}</p>
      <LineageNotice lineage={summary.lineage} />

      <EvidenceTable
        title={t("Activity attempts")}
        caption="Sanitized activity-attempt state"
        rows={activities}
        columns={['Activity', 'Status', 'State']}
        renderRow={(activity) => (
          <tr key={activity.id}>
            <th scope="row">{activity.activityId}</th>
            <td>{labelStatus(activity.status)}</td>
            <td>{displayValue(activity.state)}</td>
          </tr>
        )}
      />
      <PageControls
        label={t("Activity attempt evidence")}
        pageInfo={pageInfo.activityAttempts}
        canGoBack={history.activityCursor.length > 0}
        onPrevious={() => onPrevious('activityAttempts')}
        onNext={() => onNext('activityAttempts')}
      />

      <EvidenceTable
        title={t("Evidence events")}
        caption="Sanitized immutable evidence events"
        rows={events}
        columns={['Sequence', 'Event', 'Payload']}
        renderRow={(event) => (
          <tr key={event.id}>
            <th scope="row">{event.sequenceNumber}</th>
            <td>{event.eventType}</td>
            <td>{displayValue(event.payload)}</td>
          </tr>
        )}
      />
      <PageControls
        label={t("Evidence event")}
        pageInfo={pageInfo.evidenceEvents}
        canGoBack={history.evidenceCursor.length > 0}
        onPrevious={() => onPrevious('evidenceEvents')}
        onNext={() => onNext('evidenceEvents')}
      />

      <EvidenceTable
        title={t("Attempt artifacts")}
        caption="Sanitized durable attempt artifacts"
        rows={artifacts}
        columns={['Artifact', 'Created', 'Payload']}
        renderRow={(artifact) => (
          <tr key={artifact.id}>
            <th scope="row">{artifact.artifactType}</th>
            <td>{artifact.createdAt || '—'}</td>
            <td>{displayValue(artifact.payload)}</td>
          </tr>
        )}
      />
      <PageControls
        label={t("Attempt artifact")}
        pageInfo={pageInfo.artifacts}
        canGoBack={history.artifactCursor.length > 0}
        onPrevious={() => onPrevious('artifacts')}
        onNext={() => onNext('artifacts')}
      />
    </section>
  );
}

export default function HubAuditorOverview({
  overview,
  report,
  learningRecord,
  attempt,
  reportLoading,
  reportError,
  traineeCanGoBack,
  sessionCanGoBack,
  onTraineePrevious,
  onTraineeNext,
  onSessionPrevious,
  onSessionNext,
  onSelectSession,
  onSelectTrainee,
  onSelectAttempt,
  learningHistory,
  reportHistory,
  onLearningPrevious,
  onLearningNext,
  onReportPrevious,
  onReportNext,
  attemptHistory,
  onAttemptPrevious,
  onAttemptNext,
}) {
  const {t} = useHubLocale();
  const trainees = overview?.postulantes || [];
  const sessions = overview?.legacySimulatorSessions || [];
  const pageInfo = overview?.pageInfo || {};

  return (
    <div className="hub-auditor-overview">
      <p className="hub-readonly-note">{t("Read-only reporting. This view has no assignment, progress, scoring, or simulator mutation controls.")}</p>

      <section aria-labelledby="hub-auditor-progress-title">
        <h3 id="hub-auditor-progress-title">{t("Hub module completion")}</h3>
        {trainees.length
          ? trainees.map((trainee) => (
              <LearnerSummary
                key={trainee.identity?.id}
                trainee={trainee}
                onSelectTrainee={onSelectTrainee}
              />
            ))
          : <p className="hub-empty-state">{t("No Postulante progress was returned.")}</p>}
        <PageControls
          label={t("Hub Postulante")}
          pageInfo={pageInfo.postulantes}
          canGoBack={traineeCanGoBack}
          onPrevious={onTraineePrevious}
          onNext={onTraineeNext}
        />
      </section>

      <section className="hub-audit-legacy" aria-labelledby="hub-legacy-sessions-title">
        <h3 id="hub-legacy-sessions-title">{t("Legacy simulator sessions")}</h3>
        {sessions.length ? (
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <div>
                  <strong>{session.traineeName || t("Unnamed legacy session")}</strong>
                  <span>{labelStatus(session.status)}</span>
                  <LineageNotice lineage={session.lineage} />
                </div>
                <button type="button" onClick={() => onSelectSession(session.id)}>{t("View operation report")}</button>
              </li>
            ))}
          </ul>
        ) : <p className="hub-empty-state">{t("No legacy simulator sessions were returned.")}</p>}
        <PageControls
          label={t("Legacy simulator session")}
          pageInfo={pageInfo.legacySimulatorSessions}
          canGoBack={sessionCanGoBack}
          onPrevious={onSessionPrevious}
          onNext={onSessionNext}
        />
      </section>

      {reportLoading && <p className="hub-page-notice" role="status">{t("Loading read-only operation report…")}</p>}
      {reportError && <p className="hub-inline-notice" role="alert">{reportError}</p>}
      <LearningRecordReport
        record={learningRecord}
        history={learningHistory}
        onPrevious={onLearningPrevious}
        onNext={onLearningNext}
        onSelectAttempt={onSelectAttempt}
      />
      <OperationReport
        report={report}
        history={reportHistory}
        onPrevious={onReportPrevious}
        onNext={onReportNext}
      />
      <AttemptEvidenceReport
        attempt={attempt}
        history={attemptHistory}
        onPrevious={onAttemptPrevious}
        onNext={onAttemptNext}
      />
    </div>
  );
}
