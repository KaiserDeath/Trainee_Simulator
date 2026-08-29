import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHubAdministrationService
} from '../../src/hub/hubAdministrationService.js';

const ids = Object.freeze({
  actor: '10000000-0000-4000-8000-000000000001',
  trainer: '10000000-0000-4000-8000-000000000002',
  learner: '10000000-0000-4000-8000-000000000003',
  course: '10000000-0000-4000-8000-000000000004'
});

const administrator = Object.freeze({
  subjectId: 'admin-subject',
  roles: ['ADMINISTRATOR']
});

function createClientFixture({
  trainerStatus = 'active',
  trainerRoles = ['trainer'],
  learnerStatus = 'active',
  learnerRoles = ['postulante'],
  courseExists = true
} = {}) {
  const identities = [
    {
      id: ids.actor,
      external_subject_reference: administrator.subjectId,
      status: 'active'
    },
    {
      id: ids.trainer,
      external_subject_reference: 'trainer-subject',
      status: trainerStatus
    },
    {
      id: ids.learner,
      external_subject_reference: 'learner-subject',
      status: learnerStatus
    }
  ];
  const rolesByIdentity = new Map([
    [ids.actor, new Set(['admin'])],
    [ids.trainer, new Set(trainerRoles)],
    [ids.learner, new Set(learnerRoles)]
  ]);
  const writes = [];
  const reads = [];

  function createQuery(table) {
    const filters = [];
    let write = null;

    function filteredRows() {
      if (table === 'hub_identities') {
        return identities.filter((row) =>
          filters.every(([field, value]) => row[field] === value)
        );
      }

      if (table === 'hub_role_assignments') {
        const identityId = filters.find(([field]) =>
          field === 'identity_id'
        )?.[1];
        const roleCode = filters.find(([field]) =>
          field === 'hub_roles.code'
        )?.[1];
        return rolesByIdentity.get(identityId)?.has(roleCode)
          ? [{ identity_id: identityId, hub_roles: { code: roleCode } }]
          : [];
      }

      if (table === 'hub_courses') {
        const courseId = filters.find(([field]) => field === 'id')?.[1];
        return courseExists && courseId === ids.course
          ? [{ id: ids.course }]
          : [];
      }

      return [];
    }

    function result() {
      if (write) {
        return { data: write, error: null };
      }
      const rows = filteredRows();
      return { data: rows[0] || null, error: null };
    }

    const query = {
      select() {
        return query;
      },
      eq(field, value) {
        filters.push([field, value]);
        reads.push({ table, field, value });
        return query;
      },
      upsert(payload) {
        write = { id: `write-${writes.length + 1}`, ...payload };
        writes.push({ table, payload });
        return query;
      },
      maybeSingle() {
        return Promise.resolve(result());
      },
      single() {
        return Promise.resolve(result());
      }
    };
    return query;
  }

  return {
    client: {
      from(table) {
        return createQuery(table);
      },
      async rpc() {
        throw new Error('RPC is not used by assignment tests.');
      }
    },
    writes,
    reads
  };
}

function createService(fixture) {
  return createHubAdministrationService({
    client: fixture.client,
    trainerVisibilityResolver: {
      async canViewLearner() {
        return true;
      }
    }
  });
}

async function expectObjectNotFound(action) {
  await assert.rejects(action, (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, 'HUB_OBJECT_NOT_FOUND');
    return true;
  });
}

test('trainer/learner assignment requires active identities with persisted roles', async () => {
  const fixture = createClientFixture();
  const result = await createService(fixture).assignTrainerLearner(
    administrator,
    ids.trainer,
    ids.learner
  );

  assert.equal(result.trainer_identity_id, ids.trainer);
  assert.equal(result.learner_identity_id, ids.learner);
  assert.equal(result.assigned_by_identity_id, ids.actor);
  assert.deepEqual(
    fixture.writes.map(({ table }) => table),
    ['hub_trainer_learner_assignments']
  );
  assert.ok(
    fixture.reads.some(({ table, field, value }) =>
      table === 'hub_role_assignments' &&
      field === 'hub_roles.code' &&
      value === 'trainer'
    )
  );
  assert.ok(
    fixture.reads.some(({ table, field, value }) =>
      table === 'hub_role_assignments' &&
      field === 'hub_roles.code' &&
      value === 'postulante'
    )
  );
});

for (const invalid of [
  { name: 'deactivated trainer', options: { trainerStatus: 'deactivated' } },
  { name: 'an identity without trainer role', options: { trainerRoles: ['postulante'] } },
  { name: 'deactivated learner', options: { learnerStatus: 'deactivated' } },
  { name: 'an identity without trainee role', options: { learnerRoles: ['trainer'] } }
]) {
  test(`trainer/learner assignment rejects ${invalid.name} before writing`, async () => {
    const fixture = createClientFixture(invalid.options);
    await expectObjectNotFound(() =>
      createService(fixture).assignTrainerLearner(
        administrator,
        ids.trainer,
        ids.learner
      )
    );
    assert.equal(fixture.writes.length, 0);
  });
}

test('course assignment requires an active postulante and an existing course', async () => {
  const fixture = createClientFixture();
  const result = await createService(fixture).assignCourse(
    administrator,
    ids.learner,
    ids.course
  );

  assert.equal(result.identity_id, ids.learner);
  assert.equal(result.course_id, ids.course);
  assert.equal(result.assigned_by_identity_id, ids.actor);
  assert.deepEqual(
    fixture.writes.map(({ table }) => table),
    ['hub_enrolments']
  );
});

for (const invalid of [
  { name: 'deactivated target', options: { learnerStatus: 'deactivated' } },
  { name: 'target without trainee role', options: { learnerRoles: ['trainer'] } },
  { name: 'missing course', options: { courseExists: false } }
]) {
  test(`course assignment rejects a ${invalid.name} before writing`, async () => {
    const fixture = createClientFixture(invalid.options);
    await expectObjectNotFound(() =>
      createService(fixture).assignCourse(
        administrator,
        ids.learner,
        ids.course
      )
    );
    assert.equal(fixture.writes.length, 0);
  });
}
