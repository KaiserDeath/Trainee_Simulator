// The simulator is served under /sim; the Hub keeps its own /hub prefix.
export const SIM_BASE = '/sim';

export function isHubPath(path) {
  return path === '/hub' || path.startsWith('/hub/');
}

// Simulator-relative path ('/trainer'), or null when the path is not under /sim.
export function toSimulatorPath(path) {
  if (path === SIM_BASE) return '/';
  if (path.startsWith(`${SIM_BASE}/`)) return path.slice(SIM_BASE.length);
  return null;
}

// Legacy simulator URLs lived at the root ('/', '/trainer', '/games/...').
// Map them under /sim so old links, bookmarks and the bare domain keep working.
export function normalizePath(path) {
  if (isHubPath(path) || toSimulatorPath(path) !== null) return path;
  return `${SIM_BASE}${path === '/' ? '' : path}`;
}

// Rewrites a legacy URL in place and returns the path the app should render.
export function syncLocation() {
  const { pathname, search, hash } = window.location;
  const next = normalizePath(pathname);

  if (next !== pathname) {
    window.history.replaceState({}, '', `${next}${search}${hash}`);
  }

  return next;
}
