import {
  cleanupLocalE2ESessions
} from '../../backend/test/e2e/localSupabaseFixture.js';

export default async function globalSetup() {
  await cleanupLocalE2ESessions();
}
