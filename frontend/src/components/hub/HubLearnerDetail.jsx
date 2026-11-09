import { useEffect, useRef, useState } from 'react';
import { useHubLocale } from '../../i18n/HubLocaleContext';
import { getHubTrainerLearner, getHubAssessmentReport } from '../../api/client';
import HubCoachingWorkspace from './HubCoachingWorkspace';
import HubAttemptHistory from './HubAttemptHistory';
import HubWorkspacePanel from './HubWorkspacePanel';
export default function HubLearnerDetail({
  learnerId,
  tab,
  canEdit,
  onBack
}) {
  const {
    t,
    formatDate
  } = useHubLocale();
  const dirty = useRef(false);
  useEffect(() => {
    const leave = event => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = event => {
      const link = event.target.closest('a');
      if (dirty.current && link && !link.hash.startsWith('#hub-detail/' + encodeURIComponent(learnerId) + '/') && !window.confirm(t('Leave this learner record? Unsaved coaching entries will be lost.'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', click, true);
    };
  }, [learnerId, t]);
  const [learner, setLearner] = useState(null),
    [report, setReport] = useState(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [retrievedAt, setRetrievedAt] = useState(null);
  useEffect(() => {
    let active = true;
    getHubTrainerLearner(learnerId).then(response => {
      if (active) {
        setLearner(response.data.postulante);
        setRetrievedAt(new Date().toISOString());
      }
    }).catch(() => {
      if (active) setError('Learner record unavailable. Retry or return to the directory.');
    });
    return () => {
      active = false;
    };
  }, [learnerId, revision]);
  useEffect(() => {
    if (!['evaluations', 'evidence'].includes(tab)) return;
    let active = true;
    getHubAssessmentReport({
      postulanteId: learnerId
    }).then(response => {
      if (active) setReport(response.data);
    }).catch(() => {
      if (active) setError('The report could not be loaded. Please try again.');
    });
    return () => {
      active = false;
    };
  }, [learnerId, tab, revision]);
  const tabs = [['overview', 'Overview'], ['learning', 'Learning progress'], ['evaluations', 'Evaluations'], ['evidence', 'Evidence'], ['coaching', 'Coaching']];
  return <section className="hub-learner-detail" onInputCapture={() => {
    dirty.current = true;
  }}>
    <button type="button" onClick={() => {
      if (!dirty.current || window.confirm(t('Leave this learner record? Unsaved coaching entries will be lost.'))) onBack();
    }}>{t('Back to learners')}</button>
    <h1>{learner?.displayName || learner?.display_name || t('Learner record')}</h1><p className="hub-meta-label">{learner?.username || learnerId}</p>
    <nav className="hub-detail-tabs" aria-label={t('Learner record')}>{tabs.map(([id, label]) => <a key={id} href={`#hub-detail/${encodeURIComponent(learnerId)}/${id}`} aria-current={tab === id ? 'page' : undefined}>{t(label)}</a>)}</nav>
    <button type="button" onClick={() => {
      setError('');
      setRevision(value => value + 1);
    }}>{t('Update snapshot')}</button>
    {retrievedAt && <p>{t('Snapshot retrieved at {0}', [formatDate(retrievedAt)])}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {!learner && !error && <p role="status">{t('Loading…')}</p>}
    {learner && ['overview', 'learning'].includes(tab) && <><p>{t('Learning progress is separate from formal evaluation results.')}</p>{!(learner.enrolments || []).length && <p>{t('No training assigned yet')}</p>}{(learner.enrolments || []).map(enrolment => <article className="hub-home-card" key={enrolment.id}><h2>{t(enrolment.course?.title || 'Assigned course')}</h2><p>{t(enrolment.status)}</p>{(enrolment.modules || []).map(module => <div key={module.id}><h3>{t(module.title)}</h3><p>{t(module.status || 'Not recorded')}</p></div>)}</article>)}</>}
    {['evaluations', 'evidence'].includes(tab) && report && <><p>{t('A scored result is not an official submission. Review the recorded status and policy revision.')}</p>{report.truncated && <p role="status">{t('Showing the 500 most recent attempts in this learner/date window. Narrow the date range to review older results.')}</p>}<HubAttemptHistory attempts={report.attempts || []} /></>}
    <HubWorkspacePanel active={tab === 'coaching'}><HubCoachingWorkspace initialLearnerId={learnerId} onSaved={() => {
        dirty.current = false;
      }} canEdit={canEdit} /></HubWorkspacePanel>
  </section>;
}
