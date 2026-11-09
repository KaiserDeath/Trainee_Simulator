import { useEffect, useState } from 'react';
import { getMyHubScoredEvaluations } from '../../api/client';
import { useHubLocale } from '../../i18n/HubLocaleContext';
export default function HubLearnerResults({
  paths
}) {
  const {
    t
  } = useHubLocale();
  const [evaluations, setEvaluations] = useState(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    getMyHubScoredEvaluations().then(response => {
      if (active) setEvaluations(response.data.evaluations || []);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [revision]);
  return <section><h1>{t('My results')}</h1><p>{t('Learning completion, practice and official submissions are separate records.')}</p><h2>{t('Learning progress')}</h2>{paths.map(path => <p key={path.course.id}>{t(path.course.title)}: {path.progress.completedActivities} / {path.progress.totalActivities}</p>)}<h2>{t('Practice')}</h2><p>{t('Completed assigned practice activities are shown below. Free simulator sessions are separate from official evaluations.')}</p>{paths.flatMap(path => path.modules.flatMap(module => module.activities.filter(activity => activity.type === 'focused_practice' && activity.completed).map(activity => <p key={activity.id}>{t(activity.title)} · {t('Completed')}</p>)))}<h2>{t('Official evaluation results')}</h2><button type="button" onClick={() => {
      setError('');
      setRevision(value => value + 1);
    }}>{t('Update snapshot')}</button>{error && <p role="alert">{t('Scored evaluation status could not be loaded.')}</p>}{evaluations === null && !error && <p role="status">{t('Loading…')}</p>}{evaluations?.map(evaluation => <article className="hub-home-card" key={evaluation.id}><h3>{t(evaluation.title)}</h3>{!evaluation.attempts?.length && <p>{t('No recorded attempts')}</p>}<ol>{evaluation.attempts?.map(attempt => <li key={attempt.id}>{t('Attempt ')}{attempt.attempt_in_set} · {t(attempt.status)} · {attempt.score ?? '—'}{attempt.status === 'submitted' ? ` · ${t('Officially submitted')}` : ` · ${t('Not yet submitted')}`}</li>)}</ol></article>)}</section>;
}
