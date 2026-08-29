const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

const PROTECTED_DATABASE_ENV_KEYS = [
  'DATABASE_URL',
  'MIGRATE_DATABASE_URL',
  'SUPABASE_DB_URL',
];

export const DISPOSABLE_DATABASE_URL_ENV = 'TREZ_DISPOSABLE_DATABASE_URL';
export const DISPOSABLE_DATABASE_CONFIRMATION_ENV =
  'TREZ_DISPOSABLE_DATABASE_CONFIRMATION';

function parseTarget(rawUrl, label, { allowSharedDatabase = false } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error(`${label} must be set explicitly.`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${label} must use the postgres or postgresql protocol.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!parsed.hostname || !databaseName) {
    throw new Error(`${label} must include an explicit host and database name.`);
  }

  if (
    !allowSharedDatabase &&
    ['postgres', 'template0', 'template1'].includes(databaseName.toLowerCase())
  ) {
    throw new Error(
      `${label} cannot target the shared PostgreSQL database "${databaseName}".`,
    );
  }

  return {
    databaseName,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    protocol: parsed.protocol,
  };
}

function targetIdentity(target) {
  return `${target.hostname}:${target.port}/${target.databaseName}`;
}

export function disposableTargetConfirmation(target) {
  return `DISPOSABLE_TEST_DATABASE:${targetIdentity(target)}`;
}

export function describeDatabaseTarget(rawUrl) {
  const target = parseTarget(rawUrl, 'Database target');
  return {
    databaseName: target.databaseName,
    hostname: target.hostname,
    port: target.port,
    identity: targetIdentity(target),
  };
}

export function resolveDisposableDatabaseTarget(environment = process.env) {
  const rawTarget = environment[DISPOSABLE_DATABASE_URL_ENV];
  const target = parseTarget(rawTarget, DISPOSABLE_DATABASE_URL_ENV);
  const expectedConfirmation = disposableTargetConfirmation(target);

  if (environment[DISPOSABLE_DATABASE_CONFIRMATION_ENV] !== expectedConfirmation) {
    throw new Error(
      `${DISPOSABLE_DATABASE_CONFIRMATION_ENV} must exactly equal ` +
        `"${expectedConfirmation}".`,
    );
  }

  for (const key of PROTECTED_DATABASE_ENV_KEYS) {
    const protectedUrl = environment[key];
    if (!protectedUrl) continue;

    const protectedTarget = parseTarget(protectedUrl, key, {
      allowSharedDatabase: true,
    });
    if (targetIdentity(protectedTarget) === targetIdentity(target)) {
      throw new Error(
        `${DISPOSABLE_DATABASE_URL_ENV} resolves to the protected ${key} target.`,
      );
    }
  }

  return {
    ...describeDatabaseTarget(rawTarget),
  };
}
