import {useHubLocale} from '../../i18n/HubLocaleContext';

export default function HubStaffHome({learners, updatedAt, busy, unavailable, onRefresh}) {
  const {t, formatDate} = useHubLocale();
  const rows = learners || [];
  const enrolments = rows.flatMap(person => person.enrolments || []);
  return <section className="hub-staff-home" aria-labelledby="hub-staff-home-title">
    <div className="hub-workspace-header"><div><h2 id="hub-staff-home-title">{t('Turn progress into guidance.')}</h2><p>{t('Review the loaded snapshot, then open the tools you need.')}</p></div><button className="hub-secondary-button" type="button" disabled={busy} onClick={onRefresh}>{busy ? t('Updating…') : t('Update snapshot')}</button></div>
    {unavailable && <p role="status" className="hub-inline-notice">{t('The snapshot could not be updated. Previously loaded records remain visible; retry Update.')}</p>}
    <p className="hub-meta-label">{updatedAt ? t('Snapshot retrieved at {0}', [formatDate(updatedAt)]) : t('No snapshot has been retrieved.')}</p>
    {learners && <div className="hub-staff-metrics">
      {[[t('Learners in loaded snapshot'), rows.length], [t('Active course assignments'), enrolments.filter(row => !['completed', 'withdrawn'].includes(row.status)).length], [t('Learners without active assignments'), rows.filter(person => !(person.enrolments || []).some(row => row.status !== 'withdrawn')).length]].map(([label, value]) => <div className="hub-home-card" key={label}><h3>{label}</h3><p className="hub-home-metric">{value}</p></div>)}
    </div>}
    <div className="hub-home-grid">
      <section className="hub-home-card"><h3>{t('Where to focus next')}</h3><p>{t('Review learner progress, organize training and connect feedback to original evidence.')}</p><div className="hub-home-actions"><a className="hub-primary-button" href="#hub-progress">{t('Learner progress')}</a><a className="hub-secondary-button" href="#hub-coaching">{t('Coaching')}</a><a className="hub-secondary-button" href="#hub-groups">{t('Cohorts & dates')}</a><a className="hub-secondary-button" href="#hub-management">{t('People, evaluations & reports')}</a></div></section>
      <section className="hub-home-card"><h3>{t('Two different decisions')}</h3><p>{t('Reinforcement uses focused learning or repeat practice. Formal reassessment requires permission and a reason, and preserves earlier results.')}</p><p>{t('Formal evaluation publication remains a separate approval step.')}</p></section>
    </div>
  </section>;
}
