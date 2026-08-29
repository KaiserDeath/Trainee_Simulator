const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1'
]);

function requireValue(environment, name) {
  const value = String(
    environment[name] ?? ''
  ).trim();

  if (!value) {
    throw new Error(
      `Local E2E requires ${name}.`
    );
  }

  return value;
}

export function assertLoopbackUrl({
  name,
  value,
  protocols
}) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Local E2E ${name} must be a valid URL.`
    );
  }

  if (
    !LOOPBACK_HOSTS.has(
      parsed.hostname.toLowerCase()
    )
  ) {
    throw new Error(
      `Local E2E ${name} must use localhost or 127.0.0.1.`
    );
  }

  if (
    protocols &&
    !protocols.includes(parsed.protocol)
  ) {
    throw new Error(
      `Local E2E ${name} uses an unsupported protocol.`
    );
  }

  return parsed;
}

export function assertLocalE2EBackendEnvironment(
  environment = process.env
) {
  if (environment.TREZ_LOCAL_E2E !== '1') {
    throw new Error(
      'Local E2E is opt-in. Set TREZ_LOCAL_E2E=1.'
    );
  }

  const backendUrl = requireValue(
    environment,
    'TREZ_E2E_BACKEND_URL'
  );
  const frontendUrl = requireValue(
    environment,
    'TREZ_E2E_FRONTEND_URL'
  );
  const databaseUrl = requireValue(
    environment,
    'TREZ_E2E_DATABASE_URL'
  );
  const supabaseUrl = requireValue(
    environment,
    'SUPABASE_URL'
  );
  const clientUrl = requireValue(
    environment,
    'CLIENT_URL'
  );
  requireValue(
    environment,
    'SUPABASE_SERVICE_ROLE_KEY'
  );

  const urls = {
    backend: assertLoopbackUrl({
      name: 'backend URL',
      value: backendUrl,
      protocols: ['http:', 'https:']
    }),
    frontend: assertLoopbackUrl({
      name: 'frontend URL',
      value: frontendUrl,
      protocols: ['http:', 'https:']
    }),
    database: assertLoopbackUrl({
      name: 'database URL',
      value: databaseUrl,
      protocols: ['postgres:', 'postgresql:']
    }),
    supabase: assertLoopbackUrl({
      name: 'Supabase URL',
      value: supabaseUrl,
      protocols: ['http:', 'https:']
    }),
    client: assertLoopbackUrl({
      name: 'client URL',
      value: clientUrl,
      protocols: ['http:', 'https:']
    })
  };

  const host = requireValue(
    environment,
    'HOST'
  ).toLowerCase();

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      'Local E2E backend HOST must use localhost or 127.0.0.1.'
    );
  }

  if (
    urls.frontend.origin !==
    urls.client.origin
  ) {
    throw new Error(
      'Local E2E frontend and client URLs must match.'
    );
  }

  return urls;
}

export function shouldDisableRandomOperationGeneration(
  environment = process.env
) {
  if (
    environment
      .TREZ_E2E_DISABLE_RANDOM_OPERATIONS !==
    '1'
  ) {
    return false;
  }

  assertLocalE2EBackendEnvironment(
    environment
  );
  return true;
}
