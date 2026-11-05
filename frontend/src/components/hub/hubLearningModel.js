// Display projections of server-authorized records. Never infer permission or scoring.
export const courseKey = path => String(path.course?.id || path.enrolment?.id || 'assigned');
export function normaliseLearningPaths(data) {
  const direct = data?.learningPath || data?.path || ((data?.course || data?.modules) ? data : null);
  const sources = direct ? [direct] : (data?.enrolments || []).filter(row => row.status !== 'withdrawn');
  return sources.map(source => {
    const rawModules = source.modules || [];
    const byId = new Map(rawModules.map(module => [module.id, module]));
    const modules = rawModules.map(module => {
      const activities = (module.activities || []).map(activity => ({
        ...activity,
        completed: activity.completed || activity.status === 'completed',
        readOnly: activity.readOnly || (module.status === 'completed' && (module.activities || []).some(item => item.content?.executionKind === 'official_evaluation')),
      }));
      const completed = activities.filter(activity => activity.completed).length;
      return {
        ...module,
        order: module.order ?? module.position,
        locked: module.locked ?? module.available === false,
        completed: module.completed || module.status === 'completed',
        prerequisites: module.prerequisites || (module.prerequisiteModuleIds || []).map(id => ({id, title: byId.get(id)?.title || 'Assigned prerequisite', completed: byId.get(id)?.status === 'completed'})),
        progress: {completedActivities: completed, totalActivities: activities.length, percentage: activities.length ? Math.round(completed / activities.length * 100) : 0},
        activities,
      };
    });
    const activities = modules.flatMap(module => module.activities);
    const completed = activities.filter(activity => activity.completed).length;
    return {enrolment: direct ? source.enrolment : source, course: source.course || {}, modules, progress: {completedActivities: completed, totalActivities: activities.length, percentage: activities.length ? Math.round(completed / activities.length * 100) : 0}};
  });
}

export function learnerRoute(hash) {
  const [pathname, query = ''] = (hash || '').replace(/^#/, '').split('?');
  const parameters = new URLSearchParams(query);
  const filters = {query: parameters.get('q') || '', course: parameters.get('course') || '', state: parameters.get('state') || ''};
  if (pathname === '/catalog') return {kind: 'catalog', ...filters};
  if (pathname === '/evaluations') return {kind: 'evaluations'};
  if (['/groups', 'hub-groups'].includes(pathname)) return {kind: 'groups'};
  if (['/learn', 'hub-learning'].includes(pathname)) return {kind: 'learn'};
  const match = /^\/courses\/([^/]+)\/modules\/([^/]+)$/.exec(pathname);
  if (match) {
    try {return {kind: 'module', course: decodeURIComponent(match[1]), module: decodeURIComponent(match[2])};}
    catch {return {kind: 'missing'};}
  }
  return {kind: ['', '/home', 'hub-main-content'].includes(pathname) ? 'home' : 'missing'};
}
export const moduleHref = (path, module) => `#/courses/${encodeURIComponent(courseKey(path))}/modules/${encodeURIComponent(module.id)}`;
export const moduleState = module => module.locked ? 'locked' : module.completed ? 'completed' : 'available';
export function nextLearningModule(paths) {
  for (const path of paths) {
    const module = path.modules.find(item => !item.locked && !item.completed);
    if (module) return {path, module};
  }
  return null;
}
