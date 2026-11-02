import assert from 'node:assert/strict';
import test from 'node:test';
import { duration, explain, requirementValue, reviewResult } from '../src/domain/trainerReview.js';
const operation = (checks, status = 'APPROVED') => ({ status, validationRequirements: checks });
test('review distinguishes confirmed differences, absent checks, missing evidence, pending and unknown status', () => {
  assert.equal(reviewResult(operation([{ label: 'Game amount', expected: 50, sent: 40, ok: false }])), 'Incorrect');
  assert.equal(reviewResult(operation([{ label: 'Game action', expected: 'Posted', sent: 'Missing', ok: false }])), 'Unverified');
  assert.equal(reviewResult(operation([])), 'Unverified');
  assert.equal(reviewResult(operation([], 'PENDING')), 'Pending');
  assert.equal(reviewResult(operation([{ expected: 1, sent: 1, ok: true }], 'UNRECOGNIZED')), 'Unverified');
  assert.equal(reviewResult(operation([{ expected: 0, sent: 0, ok: true }])), 'Correct');
});
test('catalog explains only supplied evidence, preserves credit units and redacts secrets', () => {
  const issue = explain({ label: 'Game amount', expected: 50, sent: 40, ok: false });
  assert.equal(issue.code, 'game-amount');
  assert.match(issue.explanation, /50 credits; recorded 40 credits/);
  assert.equal(requirementValue('literal-secret', 'Password'), 'Redacted');
  assert.equal(requirementValue(0, 'Game ID'), '0');
  assert.equal(requirementValue(null, 'Balance'), 'Not recorded');
  assert.doesNotMatch(explain({ label: 'Password', sent: 'literal-secret', expected: 'other-secret' }).explanation, /literal-secret|other-secret/);
  assert.match(explain({ label: 'Game action', sent: 'Missing', expected: 'Posted' }).instruction, /never execute it again/);
});
test('missing timing remains different from genuine zero', () => {
  assert.equal(duration(null), 'Not recorded');
  assert.equal(duration(''), 'Not recorded');
  assert.equal(duration(0), '0s');
});
