// The Hub embed shapes are the hardest part of the pg adapter: nested
// two-level embeds, !inner joins filtered on an embedded column, and joins that
// must be disambiguated by foreign key name. Each one can silently return the
// wrong rows rather than fail, so they are exercised against a real database.

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { createPgClient } from '../../src/db/pgClient.js';

const connectionString = process.env.TREZ_PG_TEST_URL;
const describe = connectionString ? test : test.skip;

const client = connectionString ? createPgClient({ connectionString }) : null;

const postulanteId = randomUUID();
const trainerId = randomUUID();
const deactivatedId = randomUUID();
const suffix = randomUUID().slice(0, 8);

describe('seeds hub identities and role assignments', async () => {
  const roles = await client.from('hub_roles').select('id, code');
  const roleId = (code) => roles.data.find((row) => row.code === code).id;

  const identities = await client.from('hub_identities').insert([
    {
      id: postulanteId,
      external_subject_reference: `subject-p-${suffix}`,
      username: `Ptester${suffix}`,
      display_name: 'Postulante Tester',
      status: 'active',
    },
    {
      id: trainerId,
      external_subject_reference: `subject-t-${suffix}`,
      username: `Ttester${suffix}`,
      display_name: 'Trainer Tester',
      status: 'active',
    },
    {
      id: deactivatedId,
      external_subject_reference: `subject-d-${suffix}`,
      username: `Dtester${suffix}`,
      display_name: 'Deactivated Postulante',
      status: 'deactivated',
      // hub_identities_deactivation_consistent requires this alongside the status.
      deactivated_at: new Date().toISOString(),
    },
  ]).select();
  assert.equal(identities.error, null, JSON.stringify(identities.error));

  const assignments = await client.from('hub_role_assignments').insert([
    { identity_id: postulanteId, role_id: roleId('postulante') },
    { identity_id: trainerId, role_id: roleId('trainer') },
    { identity_id: deactivatedId, role_id: roleId('postulante') },
  ]).select();
  assert.equal(assignments.error, null, JSON.stringify(assignments.error));
  assert.equal(assignments.data.length, 3);
});

test.after(async () => {
  if (!client) return;
  const ids = [postulanteId, trainerId, deactivatedId];
  await client.from('hub_role_assignments').delete().in('identity_id', ids);
  await client.from('hub_identities').delete().in('id', ids);
  await client.end();
});

describe('a nested two-level embed yields an array of objects', async () => {
  // hub_identities -> hub_role_assignments (array) -> hub_roles (object)
  const result = await client
    .from('hub_identities')
    .select('id, username, hub_role_assignments(hub_roles(code))')
    .eq('id', postulanteId)
    .maybeSingle();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.ok(Array.isArray(result.data.hub_role_assignments));
  assert.equal(result.data.hub_role_assignments.length, 1);

  const assignment = result.data.hub_role_assignments[0];
  assert.ok(assignment.hub_roles && !Array.isArray(assignment.hub_roles));
  assert.equal(assignment.hub_roles.code, 'postulante');
});

describe('an !inner embed filtered on an embedded column keeps only matching rows', async () => {
  const result = await client
    .from('hub_role_assignments')
    .select('identity_id, hub_roles!inner(code)')
    .eq('identity_id', postulanteId)
    .eq('hub_roles.code', 'postulante')
    .maybeSingle();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.ok(result.data, 'the postulante assignment must match');
  assert.equal(result.data.identity_id, postulanteId);
});

describe('an embedded-column filter excludes non-matching parents', async () => {
  // The trainer holds a role, but not this one: the parent row must vanish
  // rather than come back with an empty embed.
  const result = await client
    .from('hub_role_assignments')
    .select('identity_id, hub_roles!inner(code)')
    .eq('identity_id', trainerId)
    .eq('hub_roles.code', 'postulante')
    .maybeSingle();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data, null, 'a trainer must not match a postulante filter');
});

describe('two !inner embeds filter on both joined tables at once', async () => {
  const result = await client
    .from('hub_role_assignments')
    .select('identity_id, hub_roles!inner(code), hub_identities!inner(status)')
    .eq('hub_roles.code', 'postulante')
    .eq('hub_identities.status', 'active');

  assert.equal(result.error, null, JSON.stringify(result.error));

  const identities = result.data.map((row) => row.identity_id);
  assert.ok(identities.includes(postulanteId), 'the active postulante must be included');
  assert.ok(
    !identities.includes(deactivatedId),
    'the deactivated postulante must be excluded by the second embedded filter',
  );
  assert.ok(!identities.includes(trainerId), 'the trainer must be excluded by the role filter');
});

describe('a non-inner embed returns the joined object', async () => {
  const result = await client
    .from('hub_role_assignments')
    .select('hub_roles(code)')
    .eq('identity_id', trainerId);

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].hub_roles.code, 'trainer');
});

describe('an ambiguous relationship is refused rather than guessed', async () => {
  // hub_evaluation_attempt_sets has two foreign keys to hub_identities.
  const result = await client
    .from('hub_evaluation_attempt_sets')
    .select('id, hub_identities(username)')
    .limit(1);

  assert.ok(result.error, 'an ambiguous embed must not silently pick a foreign key');
  assert.match(result.error.message, /Ambiguous relationship/);
  assert.match(result.error.message, /hub_evaluation_attempt_sets_identity_id_fkey/);
});

describe('naming the foreign key resolves the ambiguity', async () => {
  const result = await client
    .from('hub_evaluation_attempt_sets')
    .select(
      'id, postulante:hub_identities!hub_evaluation_attempt_sets_identity_id_fkey(id, username, display_name)',
    )
    .limit(1);

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.ok(Array.isArray(result.data));
});

describe('a composite foreign key joins on every column', async () => {
  // hub_module_progress(enrolment_id, course_id) -> hub_enrolments(id, course_id)
  const result = await client
    .from('hub_enrolments')
    .select('identity_id, hub_module_progress(module_id,status)')
    .limit(1);

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.ok(Array.isArray(result.data));
});

describe('select with a star plus an embed returns both', async () => {
  const result = await client
    .from('hub_role_assignments')
    .select('*, hub_roles(code)')
    .eq('identity_id', trainerId)
    .maybeSingle();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data.identity_id, trainerId);
  assert.ok(result.data.role_id, 'base columns must still be present');
  assert.equal(result.data.hub_roles.code, 'trainer');
});

describe('ordering applies to the base table alongside an embed', async () => {
  const result = await client
    .from('hub_identities')
    .select('username, hub_role_assignments(hub_roles(code))')
    .in('id', [postulanteId, trainerId, deactivatedId])
    .order('username', { ascending: true });

  assert.equal(result.error, null, JSON.stringify(result.error));
  const names = result.data.map((row) => row.username);
  assert.deepEqual(names, [...names].sort(), 'rows must come back ordered');
  assert.equal(names.length, 3);
});
