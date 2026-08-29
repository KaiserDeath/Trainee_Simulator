const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function optionalUrl(value, name) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}

export function getHubAuthConfig(environment = process.env) {
  const supabaseUrl = optionalUrl(environment.SUPABASE_URL, 'SUPABASE_URL');
  const publicBackendUrl = optionalUrl(
    environment.HUB_PUBLIC_BACKEND_URL,
    'HUB_PUBLIC_BACKEND_URL'
  );
  const clientUrl = optionalUrl(environment.CLIENT_URL, 'CLIENT_URL');
  const anonKey = String(environment.SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !publicBackendUrl || !clientUrl || !anonKey) {
    return Object.freeze({ configured: false });
  }

  const production = environment.NODE_ENV === 'production';
  if (
    production &&
    (
      publicBackendUrl.protocol !== 'https:' ||
      clientUrl.protocol !== 'https:' ||
      LOCAL_HOSTS.has(publicBackendUrl.hostname) ||
      LOCAL_HOSTS.has(clientUrl.hostname)
    )
  ) {
    throw new Error('Production Hub authentication requires explicit non-local HTTPS frontend and backend URLs.');
  }

  const secureCookies = production || environment.HUB_COOKIE_SECURE === '1';
  return Object.freeze({
    configured: true,
    supabaseUrl: supabaseUrl.origin,
    anonKey,
    publicBackendOrigin: publicBackendUrl.origin,
    clientOrigin: clientUrl.origin,
    secureCookies,
  });
}
