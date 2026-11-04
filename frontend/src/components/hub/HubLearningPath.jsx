import {hubText} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
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
  const {t}=useHubLocale();
  const values = progressValues(progress);
  const text = values.total > 0
    ? t(values.total===1?'{0} of {1} activity complete':'{0} of {1} activities complete',[values.completed,values.total])
    : t('No activities assigned');

  return (
    <div className="hub-progress-block">
      <div className="hub-progress-label">
        <span>{t(label)}</span>
        <span>{t(text)}</span>
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
  const {t} = useHubLocale();
  if (!prerequisites.length) return <p className="hub-prerequisite-empty">{t("No prerequisites")}</p>;

  return (
    <ul className="hub-prerequisites" aria-label={t("Module prerequisites")}>
      {prerequisites.map((prerequisite) => (
        <li key={prerequisite.id || prerequisite.title}>
          <span aria-hidden="true">{prerequisite.completed ? '✓' : '○'}</span>
          <span>{t(prerequisite.title)}</span>
          <span>{prerequisite.completed ? t("Complete") : t("Required")}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HubLearningPath({ path, selectedModuleId, onSelectModule, busyActivityId, onCompleteActivity }) {
  const {t} = useHubLocale();
  const modules = path.modules || [];
  const selectedModule = modules.find((module) => module.id === selectedModuleId) || modules[0];

  if (!selectedModule) {
    return <p className="hub-empty-state">{t("No learning modules are currently assigned.")}</p>;
  }

  return (
    <div className="hub-learning-layout">
      <nav className="hub-module-nav" aria-label={t("Assigned learning path")}>
        <h2>{t("Assigned path")}</h2>
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
                    <strong>{t(module.title)}</strong>
                    <small>{module.locked ? t("Prerequisite required") : module.completed ? t("Completed") : t("Available")}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="hub-module-detail" aria-labelledby="hub-module-title">
        <span className="hub-eyebrow">{t("Module ")}{selectedModule.order}</span>
        <h2 id="hub-module-title">{t(selectedModule.title)}</h2>
        {selectedModule.summary && <p className="hub-module-summary">{t(selectedModule.summary)}</p>}

        <div className="hub-module-metadata">
          <div>
            <h3>{t("Prerequisites")}</h3>
            <Prerequisites prerequisites={selectedModule.prerequisites} />
          </div>
          <ProgressBar progress={selectedModule.progress || moduleProgress(selectedModule)} label={t("{0} progress", [hubText(selectedModule.title)])} />
        </div>

        {(selectedModule.provisional || selectedModule.scored === false) && (
          <p className="hub-provisional" role="note">
            {selectedModule.provisional ? t("Provisional learning content") : t("Validated learning content")} · {selectedModule.scored === false ? t("Non-scored") : t("Scoring status assigned by server")}{t(". Business validation is still required before provisional material can be used for formal assessment.")}</p>
        )}

        {selectedModule.locked ? (
          <p className="hub-inline-notice" role="status">{t("Complete the listed prerequisites to open this module.")}</p>
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
