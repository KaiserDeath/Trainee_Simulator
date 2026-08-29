import {
  defineConfig,
  devices
} from '@playwright/test';
import process from 'node:process';

import {
  assertLocalE2EBackendEnvironment
} from '../../backend/src/config/localE2EGuard.js';

const urls =
  assertLocalE2EBackendEnvironment();

export default defineConfig({
  testDir: '.',
  testMatch: '*.local-e2e.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir:
    '../node_modules/.cache/playwright-local-e2e-results',
  globalSetup:
    './local-real.global-setup.js',
  globalTeardown:
    './local-real.global-teardown.js',
  use: {
    baseURL: urls.frontend.origin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-local-real',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],
  webServer: [
    {
      command:
        'npm --prefix ../../backend run start',
      env: {
        NODE_ENV: 'test',
        TREZ_LOCAL_E2E: '1',
        TREZ_E2E_DISABLE_RANDOM_OPERATIONS:
          '1',
        TREZ_E2E_BACKEND_URL:
          process.env.TREZ_E2E_BACKEND_URL,
        TREZ_E2E_FRONTEND_URL:
          process.env.TREZ_E2E_FRONTEND_URL,
        TREZ_E2E_DATABASE_URL:
          process.env.TREZ_E2E_DATABASE_URL,
        SUPABASE_URL:
          process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY:
          process.env
            .SUPABASE_SERVICE_ROLE_KEY,
        CLIENT_URL:
          process.env.CLIENT_URL,
        HOST: '127.0.0.1',
        PORT: '8080'
      },
      url:
        `${urls.backend.origin}/health`,
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command:
        `npm --prefix .. run dev -- --host 127.0.0.1 --port ${urls.frontend.port || '4173'} --strictPort`,
      env: {
        VITE_API_URL:
          urls.backend.origin,
        SUPABASE_SERVICE_ROLE_KEY: '',
        TREZ_E2E_DATABASE_URL: ''
      },
      url: urls.frontend.origin,
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});
