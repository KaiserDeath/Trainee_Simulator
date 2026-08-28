import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const localEnvPath = fileURLToPath(
  new URL('../../.env.local', import.meta.url)
);
const defaultEnvPath = fileURLToPath(
  new URL('../../.env', import.meta.url)
);

// Load local settings first so they win over the fallback .env file, while
// still allowing explicitly supplied process environment variables to win.
dotenv.config({ path: localEnvPath, quiet: true });
dotenv.config({ path: defaultEnvPath, quiet: true });
