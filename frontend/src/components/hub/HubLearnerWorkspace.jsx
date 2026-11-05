import {useEffect, useRef, useState} from 'react';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {courseKey, learnerRoute, moduleHref, moduleState, nextLearningModule} from './hubLearningModel';
import HubLearningPath, {ProgressBar} from './HubLearningPath';
import HubScoredEvaluationOverview from './HubScoredEvaluationOverview';
import HubCohorts from './HubCohorts';
import HubTrainingAssignments from './HubTrainingAssignments';

const stateText = {available: 'Available', completed: 'Completed', locked: 'Prerequisite required'};
const selectionFor = (paths, route) => {
  const path = paths.find(item => courseKey(item) === route.course);
  return path?.modules.some(module => module.id === route.module) ? {course: route.course, module: route.module} : null;
};

export default function HubLearnerWorkspace({paths, busyActivityId, onCompleteActivity, assessmentOpen, onActiveChange}) {
  const {t, locale} = useHubLocale();
  const [hash, setHash] = useState(() => window.location.hash);
  const [selection, setSelection] = useState(() => selectionFor(paths, learnerRoute(window.location.hash)) || {course: courseKey(paths[0] || {}), module: paths[0]?.modules[0]?.id});
  const dirty = useRef(false);
  const navigation = useRef({hash, paths, assessmentOpen, t});
  useEffect(() => {navigation.current = {hash, paths, assessmentOpen, t};}, [hash, paths, assessmentOpen, t]);
  useEffect(() => {
    const change = () => {
      const current = navigation.current;
      const next = window.location.hash;
      if (next === '#hub-main-content') return;
      if (next === current.hash) return;
      if (current.assessmentOpen || (dirty.current && !window.confirm(current.t('Leave this activity? Unsaved entries will remain in this page until you select another module.')))) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${current.hash}`);
        return;
      }
      const selected = selectionFor(current.paths, learnerRoute(next));
      if (selected) setSelection(selected);
      dirty.current = false;
      navigation.current = {...current, hash: next};
      setHash(next);
      requestAnimationFrame(() => {
        const heading = document.querySelector('#hub-main-content [data-learner-view]:not([hidden]) h1');
        if (heading) {heading.tabIndex = -1; heading.focus({preventScroll: true}); window.scrollTo(0, 0);}
      });
    };
    const leave = event => {if (dirty.current || navigation.current.assessmentOpen) {event.preventDefault(); event.returnValue = '';}};
    window.addEventListener('hashchange', change); window.addEventListener('popstate', change); window.addEventListener('beforeunload', leave);
    return () => {window.removeEventListener('hashchange', change); window.removeEventListener('popstate', change); window.removeEventListener('beforeunload', leave);};
  }, []);

  const route = learnerRoute(hash);
  const selectedPath = paths.find(path => courseKey(path) === selection.course) || paths[0];
  const validModuleRoute = route.kind !== 'module' || Boolean(selectionFor(paths, route));
  const studyVisible = ['module', 'learn'].includes(route.kind) && validModuleRoute;
  const next = nextLearningModule(paths);
  const modules = paths.flatMap(path => path.modules.map(module => ({path, module})));
  const matching = modules.filter(({path, module}) => {
    const text = `${t(module.title)} ${t(module.summary || '')} ${t(path.course.title || '')}`.toLocaleLowerCase(locale);
    return (!route.course || courseKey(path) === route.course) && (!route.state || moduleState(module) === route.state) && text.includes((route.query || '').trim().toLocaleLowerCase(locale));
  });
  function filter(key, value) {
    const parameters = new URLSearchParams(hash.split('?')[1] || '');
    if (value) parameters.set(key, value); else parameters.delete(key);
    const nextHash = `#/catalog${parameters.size ? `?${parameters}` : ''}`;
    window.history.replaceState(null, '', nextHash); setHash(nextHash);
  }
  function selectModule(id) {
    const module = selectedPath?.modules.find(item => item.id === id);
    if (module) window.location.hash = moduleHref(selectedPath, module);
  }

  return <div className="hub-learner-shell">
    <nav className="hub-learner-nav" aria-label={t('Learning navigation')}>
      {[['#/home', 'My training', 'home'], ['#/catalog', 'Module catalog', 'catalog'], ['#/learn', 'Learning workspace', 'learn'], ['#/evaluations', 'Evaluations', 'evaluations'], ['#/groups', 'My training groups', 'groups']].map(([href, text, kind]) => <a key={kind} href={href} aria-current={(route.kind === kind || (kind === 'learn' && route.kind === 'module')) ? 'page' : undefined} aria-disabled={assessmentOpen || undefined} onClick={event => {if (assessmentOpen) event.preventDefault();}}>{t(text)}</a>)}
    </nav>
    {!assessmentOpen && route.kind === 'home' && <div data-learner-view>
      <div className="hub-workspace-intro"><p className="hub-eyebrow">{t('YOUR LEARNING PATH')}</p><h1>{t('A clear next step.')}</h1><p>{t('Continue assigned training or revisit a skill with your Capacitador.')}</p></div>
      <div className="hub-home-grid">
        <div>
          <section className="hub-home-card hub-next-step" aria-labelledby="hub-next-title">
            <p className="hub-eyebrow">{t('Next learning activity')}</p>
            <h2 id="hub-next-title">{next ? t(next.module.title) : t(paths.length ? 'Your assigned learning is up to date' : 'No training assigned yet')}</h2>
            <p>{next ? t(next.module.summary || 'Continue with the next available module in your assigned path.') : t(paths.length ? 'Review completed modules or check your evaluation status. Learning completion is separate from formal results.' : 'Your Capacitador can assign training for onboarding or reinforcement.')}</p>
            {next && <p className="hub-meta-label">{t(next.path.course.title || 'Assigned course')}</p>}
            <div className="hub-home-actions">{next && <a className="hub-primary-button" href={moduleHref(next.path, next.module)}>{t('Continue module')}</a>}<a className="hub-secondary-button" href="#/catalog">{t('Browse modules')}</a></div>
          </section>
          <section className="hub-home-card" aria-labelledby="hub-assigned-title"><h2 id="hub-assigned-title">{t('Assigned training')}</h2>
            {!paths.length && <p className="hub-empty-state">{t('No learning modules are currently assigned.')}</p>}
            {paths.map(path => <article className="hub-assigned-course" key={courseKey(path)}><h3>{t(path.course.title || 'Assigned course')}</h3><p>{t(path.course.description || '')}</p><ProgressBar progress={path.progress} label={t('Course progress')}/><a href={`#/catalog?course=${encodeURIComponent(courseKey(path))}`}>{t('View assigned modules')}</a></article>)}
          </section>
        </div>
        <div>
          <section className="hub-home-card"><h2>{t('Learning progress')}</h2><p className="hub-home-metric">{modules.filter(({module}) => module.completed).length}<small> / {modules.length} {t('modules completed')}</small></p><p>{t('Learning progress is separate from formal evaluation results.')}</p><a href="#/evaluations">{t('View evaluation status')}</a></section>
          <section className="hub-home-card"><h2>{t('Already working?')}</h2><p>{t('Ask your Capacitador for targeted reinforcement. Your previous results stay in your history.')}</p></section>
          <HubTrainingAssignments mine paths={paths}/>
          <p><a className="hub-secondary-link" href="/simulator">{t('Open free operator simulator')}</a></p>
        </div>
      </div>
    </div>}
    {!assessmentOpen && route.kind === 'catalog' && <div data-learner-view>
      <div className="hub-workspace-intro"><p className="hub-eyebrow">{t('ASSIGNED TRAINING')}</p><h1>{t('Module catalog')}</h1><p>{t('Explore assigned modules. Prerequisites explain what you can open next.')}</p></div>
      <div className="hub-catalog-filters">
        <label>{t('Search modules')}<input type="search" value={route.query || ''} onChange={event => filter('q', event.target.value)}/></label>
        <label>{t('Course')}<select value={route.course || ''} onChange={event => filter('course', event.target.value)}><option value="">{t('All assigned courses')}</option>{paths.map(path => <option value={courseKey(path)} key={courseKey(path)}>{t(path.course.title || 'Assigned course')}</option>)}</select></label>
        <label>{t('Availability')}<select value={route.state || ''} onChange={event => filter('state', event.target.value)}><option value="">{t('All assigned modules')}</option>{Object.entries(stateText).map(([value, text]) => <option key={value} value={value}>{t(text)}</option>)}</select></label>
      </div>
      <p className="hub-catalog-count" role="status">{t('{0} modules shown', [matching.length])}</p>
      <div className="hub-catalog-grid">{matching.map(({path, module}) => <article className="hub-home-card hub-catalog-card" key={`${courseKey(path)}:${module.id}`}><p className="hub-meta-label">{t(path.course.title || 'Assigned course')} · {t('Module ')}{module.order}</p><span className="hub-module-status">{t(stateText[moduleState(module)])}</span><h2>{t(module.title)}</h2><p>{t(module.summary || '')}</p>{module.locked && <p className="hub-inline-notice">{t('Complete the listed prerequisites to open this module.')}</p>}<a className="hub-secondary-button" href={moduleHref(path, module)}>{t('View module')}</a></article>)}</div>
      {!matching.length && <section className="hub-home-card"><h2>{t('No matching modules')}</h2><p>{t('Try another search or reset the filters.')}</p><a className="hub-secondary-button" href="#/catalog">{t('Reset filters')}</a></section>}
    </div>}
    <div data-learner-view hidden={assessmentOpen || !studyVisible} onInputCapture={() => {dirty.current = true;}}>
      <div className="hub-study-heading"><a href="#/catalog">{t('Back to catalog')}</a><h1>{t('Learning workspace')}</h1></div>
      {selectedPath ? <HubLearningPath path={selectedPath} selectedModuleId={selection.module} onSelectModule={selectModule} busyActivityId={busyActivityId} onCompleteActivity={async (...args) => {if (await onCompleteActivity(...args)) dirty.current = false;}}/> : <p className="hub-empty-state">{t('No learning modules are currently assigned.')}</p>}
    </div>
    <div data-learner-view hidden={assessmentOpen || (route.kind !== 'missing' && validModuleRoute)}><h1>{t('Module unavailable')}</h1><p>{t('This link is not part of your assigned training. Open the catalog to choose an available module.')}</p><a href="#/catalog">{t('Back to catalog')}</a></div>
    {!assessmentOpen && route.kind === 'groups' && <div data-learner-view><h1>{t('My training groups')}</h1><HubCohorts canManage={false} locale={locale}/></div>}
    <div data-learner-view hidden={!assessmentOpen && route.kind !== 'evaluations'}><h1>{t('Evaluations')}</h1>{assessmentOpen && <p className="hub-inline-notice">{t('An assessment is open. Complete it before changing workspace.')}</p>}<HubScoredEvaluationOverview onActiveChange={onActiveChange}/></div>
  </div>;
}
