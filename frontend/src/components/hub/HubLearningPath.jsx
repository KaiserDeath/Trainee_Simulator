import HubActivityRenderer from './HubActivityRenderer';

const progressValues = (progress = {}) => ({
  completed: progress.completedActivities ?? progress.completed ?? 0,
  total: progress.totalActivities ?? progress.total ?? 0,
  percentage: Math.max(0, Math.min(100, progress.percentage ?? 0)),
});

const activityComplete = (activity) => activity.completed || activity.status === 'completed';

const moduleProgress = (module) => {
  const activities = module.activities || [];
  const completed = activities.filter(activityComplete).length;
  return {
    completedActivities: completed,
    totalActivities: activities.length,
    percentage: activities.length ? Math.round((completed / activities.length) * 100) : 0,
  };
};

function ProgressBar({ progress, label }) {
  const values = progressValues(progress);
  const text = values.total > 0
    ? `${values.completed} of ${values.total} activities complete`
    : 'No activities assigned';

  return (
    <div className="hub-progress-block">
      <div className="hub-progress-label">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div
        className="hub-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={values.percentage}
        aria-valuetext={text}
      >
        <span style={{ width: `${values.percentage}%` }} />
      </div>
    </div>
  );
}

function Prerequisites({ prerequisites = [] }) {
  if (!prerequisites.length) return <p className="hub-prerequisite-empty">No prerequisites</p>;

  return (
    <ul className="hub-prerequisites" aria-label="Module prerequisites">
      {prerequisites.map((prerequisite) => (
        <li key={prerequisite.id || prerequisite.title}>
          <span aria-hidden="true">{prerequisite.completed ? '✓' : '○'}</span>
          <span>{prerequisite.title}</span>
          <span>{prerequisite.completed ? 'Complete' : 'Required'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HubLearningPath({ path, selectedModuleId, onSelectModule, busyActivityId, onCompleteActivity }) {
  const modules = path.modules || [];
  const selectedModule = modules.find((module) => module.id === selectedModuleId) || modules[0];

  if (!selectedModule) {
    return <p className="hub-empty-state">No learning modules are currently assigned.</p>;
  }

  return (
    <div className="hub-learning-layout">
      <nav className="hub-module-nav" aria-label="Assigned learning path">
        <h2>Assigned path</h2>
        <ol>
          {modules.map((module, index) => {
            const active = module.id === selectedModule.id;
            return (
              <li key={module.id}>
                <button
                  type="button"
                  className={active ? 'is-active' : ''}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => onSelectModule(module.id)}
                >
                  <span className="hub-module-number">{module.order ?? index + 1}</span>
                  <span>
                    <strong>{module.title}</strong>
                    <small>{module.locked ? 'Prerequisite required' : module.completed ? 'Completed' : 'Available'}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="hub-module-detail" aria-labelledby="hub-module-title">
        <span className="hub-eyebrow">Module {selectedModule.order}</span>
        <h2 id="hub-module-title">{selectedModule.title}</h2>
        {selectedModule.summary && <p className="hub-module-summary">{selectedModule.summary}</p>}

        <div className="hub-module-metadata">
          <div>
            <h3>Prerequisites</h3>
            <Prerequisites prerequisites={selectedModule.prerequisites} />
          </div>
          <ProgressBar progress={selectedModule.progress || moduleProgress(selectedModule)} label={`${selectedModule.title} progress`} />
        </div>

        {(selectedModule.provisional || selectedModule.scored === false) && (
          <p className="hub-provisional" role="note">
            {selectedModule.provisional ? 'Provisional learning content' : 'Validated learning content'} · {selectedModule.scored === false ? 'Non-scored' : 'Scoring status assigned by server'}. Business validation is still required before provisional material can be used for formal assessment.
          </p>
        )}

        {selectedModule.locked ? (
          <p className="hub-inline-notice" role="status">Complete the listed prerequisites to open this module.</p>
        ) : (
          <div className="hub-activity-list">
            {(selectedModule.activities || []).map((activity) => (
              <HubActivityRenderer
                key={activity.id}
                activity={activity}
                busy={busyActivityId === activity.id}
                onComplete={(state) => onCompleteActivity(activity, state)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export { ProgressBar };
