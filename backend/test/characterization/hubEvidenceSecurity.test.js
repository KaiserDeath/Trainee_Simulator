import assert from 'node:assert/strict';
import test from 'node:test';

import { createHubService } from '../../src/hub/hubService.js';

const identity = Object.freeze({ subjectId: 'postulante-subject', roles: ['POSTULANTE'] });

for (const state of [
  { password: 'literal' },
  { nested: { new_password: 'literal' } },
  { evidence: [{ accessToken: 'literal' }] },
  { cookie: 'literal' },
]) {
  test(`rejects sensitive Hub evidence key ${JSON.stringify(Object.keys(state))}`, async () => {
    let writes = 0;
    const service = createHubService({
      async completeActivity() {
        writes += 1;
        return {};
      },
    });

    await assert.rejects(
      () => service.completeActivity(identity, 'activity-id', {
        state,
        idempotencyKey: 'evidence-security-test',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.code, 'HUB_SENSITIVE_EVIDENCE_REJECTED');
        return true;
      }
    );
    assert.equal(writes, 0);
  });
}

test('allows non-secret completion evidence and boolean credential presence markers', async () => {
  let recorded;
  const service = createHubService({
    async completeActivity(input) {
      recorded = input;
      return { completed: true };
    },
  });
  const state = {
    reviewed: true,
    passwordProvided: true,
    nested: { validationResult: 'matched' },
  };

  await service.completeActivity(identity, 'activity-id', {
    state,
    idempotencyKey: 'safe-evidence-test',
  });
  assert.deepEqual(recorded.state, state);
});
