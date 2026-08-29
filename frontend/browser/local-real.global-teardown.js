import {
  cleanupLocalE2ESessions
} from '../../backend/test/e2e/localSupabaseFixture.js';

export default async function globalTeardown() {
  await cleanupLocalE2ESessions();
}
