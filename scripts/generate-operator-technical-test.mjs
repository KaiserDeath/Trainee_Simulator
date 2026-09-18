#!/usr/bin/env node
// Generates the Operator Technical Test (candidate booklet + evaluator key)
// deterministically from a form letter.
//
//   node scripts/generate-operator-technical-test.mjs A
//
// The test is built on the simulator's own workflow — request queue, exact
// account lookup, held funds, separate game and Backend histories, decision
// with a reason — but every rule it depends on is printed on the sheet. It
// contains no Trez account-identifier formula, game initials or password
// policy, so it can be given before any module has been taught.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'evaluations');
const FORM = (process.argv[2] || 'A').toUpperCase();

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(hashSeed(`trez-operator-technical-${FORM}`));

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad = (value, width) => String(value).padStart(width, '0');

// ---------------------------------------------------------------------------
// Operating rules printed in the booklet
// ---------------------------------------------------------------------------

const RULES = [
  ['R1', 'Do not act on a request until both the customer and the game account on the request match the records exactly. A single different character is a different account.'],
  ['R2', 'The game platform and the Backend keep separate histories. A game-side action is recorded only in the game history; a Backend decision is recorded only in the Backend history. One game action must produce exactly one Backend decision.'],
  ['R3', 'Adding credits places a hold on the customer funds. `Available = Balance - Held`. Only Available may be committed.'],
  ['R4', 'A withdrawal may proceed only if the game account balance covers the full requested amount.'],
  ['R5', 'Every rejection or cancellation requires a reason code. A decision without a reason is not valid.'],
  ['R6', 'If the evidence is missing, unreadable or contradictory, stop and escalate. Do not act on a request you cannot verify.'],
];

const REASONS = [
  ['M1', 'Customer or game account does not match the request'],
  ['M2', 'Movement already processed (duplicate)'],
  ['M3', 'Insufficient funds for the requested operation'],
  ['M4', 'Evidence missing, unreadable or incomplete'],
  ['M5', 'Available information contradicts itself'],
  ['M6', 'Everything matches, no observations'],
];

// ---------------------------------------------------------------------------
// Section 1 — exact account lookup
// ---------------------------------------------------------------------------

const REGISTRY = [
  'ACC-4F8K-2093',
  'ACC-7B2M-1150',
  'ACC-9C1T-3047',
  'ACC-2H6R-8821',
  'ACC-5S3D-4460',
  'ACC-4F8K-2O93',
  'ACC-8G4W-7712',
  'ACC-2H6R-8812',
  'ACC-1L9Q-6304',
  'ACC-9C1T-3O47',
  'ACC-6Z0N-5583',
  'ACC-3K7V-2298',
  'ACC-5S3D-4462',
  'ACC-8G4W-7T12',
  'ACC-1I9Q-6304',
  'ACC-6Z0N-5S83',
];

const LOOKUPS = [
  'ACC-9C1T-3047',
  'ACC-2H6R-8812',
  'ACC-4F8K-2O93',
  'ACC-6Z0N-5583',
  'ACC-8G4W-7T12',
  'ACC-5S3D-4461',
  'ACC-1L9O-6304',
  'ACC-3K7V-2289',
];

function buildSection1() {
  if (new Set(REGISTRY).size !== REGISTRY.length) {
    throw new Error('the Section 1 registry contains duplicate identifiers');
  }
  const registry = shuffle(REGISTRY);
  const lookups = shuffle(LOOKUPS).map((query) => {
    const index = registry.indexOf(query);
    return { query, answer: index === -1 ? 'NOT PRESENT' : String(index + 1) };
  });
  if (lookups.filter((item) => item.answer !== 'NOT PRESENT').length !== 5) {
    throw new Error('Section 1 must keep exactly five real matches');
  }
  return { registry, lookups };
}

// ---------------------------------------------------------------------------
// Section 2 — available balance against held funds
// ---------------------------------------------------------------------------

// trap: requested fits the raw Balance but not Available. boundary: requested
// is exactly Available. clear: comfortably within Available.
const HOLDS_BANK = [
  { customer: 'C-2041', balance: 900, held: 350, requested: 600, kind: 'trap' },
  { customer: 'C-3118', balance: 500, held: 0, requested: 480, kind: 'clear' },
  { customer: 'C-4702', balance: 740, held: 240, requested: 500, kind: 'boundary' },
  { customer: 'C-5263', balance: 1200, held: 800, requested: 450, kind: 'trap' },
  { customer: 'C-6890', balance: 300, held: 75, requested: 180, kind: 'clear' },
  { customer: 'C-7355', balance: 650, held: 650, requested: 25, kind: 'trap' },
  { customer: 'C-8014', balance: 480, held: 130, requested: 350, kind: 'boundary' },
  { customer: 'C-9127', balance: 1000, held: 250, requested: 700, kind: 'clear' },
];

function buildSection2() {
  // Fixed 3 traps / 1 boundary / 2 clear, so the section splits 3 REJECT and
  // 3 PROCEED. A uniform answer scores half.
  const byKind = (kind) => shuffle(HOLDS_BANK.filter((row) => row.kind === kind));
  const draw = [...byKind('trap').slice(0, 3), ...byKind('boundary').slice(0, 1), ...byKind('clear').slice(0, 2)];
  if (draw.length !== 6) throw new Error('the Section 2 bank cannot fill the 3/1/2 composition');

  const rows = shuffle(draw)
    .map((row) => {
      const available = row.balance - row.held;
      const proceed = row.requested <= available;
      if (row.kind === 'trap' && (proceed || row.requested > row.balance)) {
        throw new Error(`row ${row.customer} is not a valid held-funds trap`);
      }
      if (row.kind === 'boundary' && row.requested !== available) {
        throw new Error(`row ${row.customer} is not on the Available boundary`);
      }
      if (row.kind === 'clear' && !proceed) {
        throw new Error(`row ${row.customer} should be clearly payable`);
      }
      return { ...row, available, decision: proceed ? 'PROCEED' : 'REJECT' };
    });

  const rejects = rows.filter((row) => row.decision === 'REJECT').length;
  if (rejects !== 3) throw new Error(`Section 2 came out with ${rejects} rejects instead of 3`);
  return rows;
}

// ---------------------------------------------------------------------------
// Section 3 — game history against Backend history
// ---------------------------------------------------------------------------

const GAME_HISTORY = [
  { ref: 'OP-4015', account: 'ACC-4F8K-2093', action: 'CREDIT', amount: 120 },
  { ref: 'OP-4029', account: 'ACC-7B2M-1150', action: 'CREDIT', amount: 250 },
  { ref: 'OP-4036', account: 'ACC-9C1T-3047', action: 'DEBIT', amount: 75 },
  { ref: 'OP-4042', account: 'ACC-2H6R-8821', action: 'CREDIT', amount: 300 },
  { ref: 'OP-4050', account: 'ACC-5S3D-4460', action: 'DEBIT', amount: 60 },
  { ref: 'OP-4063', account: 'ACC-8G4W-7712', action: 'CREDIT', amount: 200 },
  { ref: 'OP-4071', account: 'ACC-1L9Q-6304', action: 'DEBIT', amount: 45 },
  { ref: 'OP-4084', account: 'ACC-6Z0N-5583', action: 'CREDIT', amount: 140 },
  { ref: 'OP-4090', account: 'ACC-3K7V-2298', action: 'DEBIT', amount: 95 },
];

const BACKEND_HISTORY = [
  { ref: 'OP-4015', customer: 'C-2041', decision: 'APPROVED', amount: 120 },
  { ref: 'OP-4029', customer: 'C-3118', decision: 'APPROVED', amount: 520 },
  { ref: 'OP-4036', customer: 'C-4702', decision: 'APPROVED', amount: 75 },
  { ref: 'OP-4050', customer: 'C-5263', decision: 'APPROVED', amount: 60 },
  { ref: 'OP-4057', customer: 'C-6890', decision: 'APPROVED', amount: 180 },
  { ref: 'OP-4063', customer: 'C-7355', decision: 'APPROVED', amount: 200 },
  { ref: 'OP-4063', customer: 'C-7355', decision: 'APPROVED', amount: 200 },
  { ref: 'OP-4071', customer: 'C-8014', decision: 'APPROVED', amount: 45 },
  { ref: 'OP-4084', customer: 'C-9127', decision: 'APPROVED', amount: 145 },
  { ref: 'OP-4090', customer: 'C-2041', decision: 'APPROVED', amount: 95 },
];

const SECTION3_KEY = {
  noBackendDecision: ['OP-4042'],
  noGameAction: ['OP-4057'],
  settledTwice: ['OP-4063'],
  amountMismatch: ['OP-4029', 'OP-4084'],
};

function buildSection3() {
  const gameRefs = GAME_HISTORY.map((row) => row.ref);
  const backendRefs = BACKEND_HISTORY.map((row) => row.ref);

  const computed = {
    noBackendDecision: gameRefs.filter((ref) => !backendRefs.includes(ref)),
    noGameAction: [...new Set(backendRefs.filter((ref) => !gameRefs.includes(ref)))],
    settledTwice: [...new Set(backendRefs.filter((ref, i) => backendRefs.indexOf(ref) !== i))],
    amountMismatch: GAME_HISTORY.filter((row) => {
      const pair = BACKEND_HISTORY.find((other) => other.ref === row.ref);
      return pair && pair.amount !== row.amount;
    }).map((row) => row.ref),
  };

  const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
  for (const bucket of Object.keys(SECTION3_KEY)) {
    if (!same(computed[bucket], SECTION3_KEY[bucket])) {
      throw new Error(`the declared Section 3 key does not match the data for ${bucket}`);
    }
  }

  return { game: shuffle(GAME_HISTORY), backend: shuffle(BACKEND_HISTORY), key: SECTION3_KEY };
}

// ---------------------------------------------------------------------------
// Section 4 — order of operations
// ---------------------------------------------------------------------------

const ORDERED_STEPS = [
  'Open the request and read the requested amount.',
  'Confirm the customer on the request matches the customer on record.',
  'Find the game account by its exact identifier.',
  'Check Available funds (Balance minus Held) against the requested amount.',
  'Perform the credit on the game platform.',
  'Confirm the game platform recorded the credit.',
  'Enter the Backend decision once.',
];

const ORDER_SCENARIOS = [
  {
    text: 'The operator opened the request, entered the Backend approval straight away so the queue would clear, and then went to the game platform to perform the credit.',
    rule: 'R2',
  },
  {
    text: 'The operator could not find ACC-5S3D-4462, saw ACC-5S3D-4460 in the list, decided it was close enough and credited that account.',
    rule: 'R1',
  },
  {
    text: 'The customer has a Balance of 900 with 350 held. The operator saw the 900, judged a 600 request affordable and committed it.',
    rule: 'R3',
  },
  {
    text: 'The proof attached to the request is cut off and the amount cannot be read. The operator credited the amount typed in the request text and moved on.',
    rule: 'R6',
  },
  {
    text: 'The operator credited the game account, the screen did not refresh, so the operator credited it a second time and then approved once in the Backend.',
    rule: 'R2',
  },
];

function buildSection4() {
  const scrambled = shuffle(ORDERED_STEPS.map((text, index) => ({ text, position: index + 1 })));
  if (scrambled.every((step, index) => step.position === index + 1)) {
    throw new Error('the scrambled step list came out already ordered');
  }
  const scenarios = shuffle(ORDER_SCENARIOS)
    .slice(0, 3)
    .map((scenario, index) => ({ ...scenario, number: index + 1 }));
  return { scrambled, scenarios };
}

// ---------------------------------------------------------------------------
// Section 5 — decide and justify
// ---------------------------------------------------------------------------

const QUEUE_BANK = [
  {
    text: 'Request: credit 150 to ACC-4F8K-2093 for customer C-3118. The account on the platform reads ACC-4F8K-2093. The customer record matches. Proof is legible and reads 150. Available funds are 400. No movement of that amount exists for this customer today.',
    funds: { available: 400, requested: 150 },
    action: 'APPROVE',
    reason: 'M6',
    critical: false,
  },
  {
    text: 'Request: credit 45 to ACC-1L9Q-6304 for customer C-8014. Account and customer match. Proof is legible and reads 45. Available funds are 610. The game history shows no earlier action for this reference.',
    funds: { available: 610, requested: 45 },
    action: 'APPROVE',
    reason: 'M6',
    critical: false,
  },
  {
    text: 'Request: credit 120 to ACC-7B2M-1150 for customer C-2041. The Backend history already shows an APPROVED decision of 120 for this same reference, entered four minutes ago, and the game history shows the matching credit.',
    action: 'REJECT',
    reason: 'M2',
    critical: false,
  },
  {
    text: 'Request: withdraw 500 from ACC-9C1T-3047 for customer C-4702. Customer and account match. The game account balance is 320.',
    funds: { available: 320, requested: 500 },
    action: 'REJECT',
    reason: 'M3',
    critical: false,
  },
  {
    text: 'Request: credit 480 to ACC-3K7V-2298 for customer C-5263. Customer and account match and the proof is legible. The customer has a Balance of 1200 with 800 already held against pending operations.',
    funds: { balance: 1200, held: 800, requested: 480 },
    action: 'REJECT',
    reason: 'M3',
    critical: false,
  },
  {
    text: 'Request: credit 200 to ACC-4F8K-2093 for customer C-6890. The only account found on the platform is ACC-4F8K-2O93. Proof is legible and reads 200.',
    action: 'STOP AND ESCALATE',
    reason: 'M1',
    critical: true,
  },
  {
    text: 'Request: credit an amount to ACC-5S3D-4460 for customer C-7355. The attached proof is cut off: the customer name is visible but the amount cannot be read with certainty.',
    action: 'STOP AND ESCALATE',
    reason: 'M4',
    critical: true,
  },
  {
    text: 'Request: the written request asks to credit 200 to ACC-8G4W-7712. The attached proof, legible, shows 2000. Customer and account match.',
    action: 'STOP AND ESCALATE',
    reason: 'M5',
    critical: true,
  },
  {
    text: 'Request: credit 90 to ACC-6Z0N-5583 for customer C-9127. No proof is attached and the Backend shows no record of funds received.',
    action: 'STOP AND ESCALATE',
    reason: 'M4',
    critical: true,
  },
];

function buildSection5() {
  const approvals = shuffle(QUEUE_BANK.filter((item) => item.action === 'APPROVE'));
  const rejections = shuffle(QUEUE_BANK.filter((item) => item.action === 'REJECT'));
  const stops = shuffle(QUEUE_BANK.filter((item) => item.action === 'STOP AND ESCALATE'));

  // Fixed 2 approve / 2 reject / 2 stop: no uniform answer beats two of six.
  const chosen = [approvals.pop(), approvals.pop(), rejections.pop(), rejections.pop(), stops.pop(), stops.pop()];
  if (chosen.some((item) => item === undefined)) {
    throw new Error('the Section 5 bank cannot fill the 2/2/2 composition');
  }

  const cases = shuffle(chosen).map((item, index) => ({ ...item, number: index + 1 }));
  const count = (action) => cases.filter((item) => item.action === action).length;
  if (count('APPROVE') !== 2 || count('REJECT') !== 2 || count('STOP AND ESCALATE') !== 2) {
    throw new Error('Section 5 did not come out balanced 2/2/2');
  }
  for (const item of cases) {
    if (!item.funds) continue;
    const { balance, held = 0, available, requested } = item.funds;
    const ceiling = available ?? balance - held;
    const affordable = requested <= ceiling;
    if (item.action === 'APPROVE' && !affordable) {
      throw new Error(`request ${item.number} approves ${requested} against ${ceiling} available`);
    }
    if (item.reason === 'M3' && affordable) {
      throw new Error(`request ${item.number} cites M3 but ${requested} fits ${ceiling} available`);
    }
  }
  if (cases.filter((item) => item.critical).length !== 2) {
    throw new Error('Section 5 must contain exactly two critical cases');
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Section 6 — exact transcription
// ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

function buildSection6() {
  return Array.from({ length: 5 }, () => {
    const block = Array.from({ length: 4 }, () => ALPHABET[Math.floor(rng() * ALPHABET.length)]).join('');
    return `ACC-${block}-${pad(Math.floor(rng() * 10000), 4)}`;
  });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const POINTS = {
  s1: 16, // 8 lookups x 2
  s2: 12, // 6 rows x (available + decision)
  s3: 10, // 5 discrepancies x 2
  s4: 13, // 7 ordered steps + 3 scenarios x 2
  s5: 18, // 6 cases x (action 2 + reason 1)
  s6: 5, // 5 identifiers
};
const POINTS_TOTAL = Object.values(POINTS).reduce((sum, value) => sum + value, 0);

// ---------------------------------------------------------------------------
// Candidate booklet
// ---------------------------------------------------------------------------

function renderBooklet({ s1, s2, s3, s4, s5, s6 }) {
  const l = [];
  l.push(`# Operator Technical Test — Form ${FORM}`);
  l.push('');
  l.push('Candidate: ______________________________   Date: ____________');
  l.push('');
  l.push('Total time: 50 minutes. Each section shows its suggested time.');
  l.push('');
  l.push('## Before you start');
  l.push('');
  l.push('- This test does not assume any prior knowledge of a game platform or of');
  l.push('  company procedure. Every rule you need is printed below.');
  l.push('- All accounts, customers, amounts and records are fictional.');
  l.push('- Flagging something that is actually correct **loses points**. Do not answer');
  l.push('  from suspicion; answer from what you verified.');
  l.push('- Write only on the ANSWER SHEET of each section.');
  l.push('- Pencil and scratch paper are allowed. Calculators and phones are not.');
  l.push('');
  l.push('## Operating rules');
  l.push('');
  for (const [code, text] of RULES) l.push(`- **${code}.** ${text}`);
  l.push('');
  l.push('---');
  l.push('');

  // Section 1
  l.push('## Section 1 — Account lookup');
  l.push('');
  l.push('Suggested time: 9 minutes. Rule in play: **R1**.');
  l.push('');
  l.push('For each account requested, write the **row number** of the registry entry that');
  l.push('matches it **exactly**, character by character. If no exact match exists, write');
  l.push('`NOT PRESENT`. Several entries are nearly identical; one different character');
  l.push('makes it a different account.');
  l.push('');
  l.push('### Account registry');
  l.push('');
  l.push('| Row | Account |');
  l.push('| ---: | --- |');
  s1.registry.forEach((id, index) => l.push(`| ${index + 1} | \`${id}\` |`));
  l.push('');
  l.push('### ANSWER SHEET — Section 1');
  l.push('');
  l.push('| # | Account requested | Row, or NOT PRESENT |');
  l.push('| ---: | --- | --- |');
  s1.lookups.forEach((item, index) => l.push(`| ${index + 1} | \`${item.query}\` |  |`));
  l.push('');
  l.push('---');
  l.push('');

  // Section 2
  l.push('## Section 2 — Available funds');
  l.push('');
  l.push('Suggested time: 8 minutes. Rules in play: **R3**, **R4**.');
  l.push('');
  l.push('Each row shows a customer, the Balance held at the Backend, the amount already');
  l.push('Held against pending operations, and the amount a new request asks to commit.');
  l.push('');
  l.push('For each row write the Available amount and whether the request may go ahead.');
  l.push('Write `PROCEED` or `REJECT`. A request equal to Available may proceed.');
  l.push('');
  l.push('| # | Customer | Balance | Held | Requested |');
  l.push('| ---: | --- | ---: | ---: | ---: |');
  s2.forEach((row, index) => l.push(`| ${index + 1} | ${row.customer} | ${row.balance} | ${row.held} | ${row.requested} |`));
  l.push('');
  l.push('### ANSWER SHEET — Section 2');
  l.push('');
  l.push('| # | Customer | Available | PROCEED / REJECT |');
  l.push('| ---: | --- | --- | --- |');
  s2.forEach((row, index) => l.push(`| ${index + 1} | ${row.customer} |  |  |`));
  l.push('');
  l.push('---');
  l.push('');

  // Section 3
  l.push('## Section 3 — History reconciliation');
  l.push('');
  l.push('Suggested time: 10 minutes. Rule in play: **R2**.');
  l.push('');
  l.push('These two histories cover the same shift. The game history records what');
  l.push('happened on the platform; the Backend history records the decisions taken.');
  l.push('Under R2 they should line up one to one. They do not.');
  l.push('');
  l.push('### Game history');
  l.push('');
  l.push('| Reference | Account | Action | Amount |');
  l.push('| --- | --- | --- | ---: |');
  for (const row of s3.game) l.push(`| ${row.ref} | \`${row.account}\` | ${row.action} | ${row.amount} |`);
  l.push('');
  l.push('### Backend history');
  l.push('');
  l.push('| Reference | Customer | Decision | Amount |');
  l.push('| --- | --- | --- | ---: |');
  for (const row of s3.backend) l.push(`| ${row.ref} | ${row.customer} | ${row.decision} | ${row.amount} |`);
  l.push('');
  l.push('### ANSWER SHEET — Section 3');
  l.push('');
  l.push('Write only the references that belong in each category. If a category is empty,');
  l.push('write `NONE`. Listing a reference that does not belong loses points.');
  l.push('');
  l.push('| Category | References |');
  l.push('| --- | --- |');
  l.push('| 1. Game action with no Backend decision |  |');
  l.push('| 2. Backend decision with no game action |  |');
  l.push('| 3. One game action settled twice in the Backend |  |');
  l.push('| 4. Present in both, but the amounts disagree |  |');
  l.push('');
  l.push('---');
  l.push('');

  // Section 4
  l.push('## Section 4 — Order of operations');
  l.push('');
  l.push('Suggested time: 8 minutes. Rules in play: all.');
  l.push('');
  l.push('### 4.1 Put the steps in order');
  l.push('');
  l.push('These are the steps for processing a request to add credits, listed out of');
  l.push('order. Number them 1 to 7 in the order they must be performed.');
  l.push('');
  l.push('| Letter | Step | Your number |');
  l.push('| --- | --- | --- |');
  s4.scrambled.forEach((step, index) => {
    l.push(`| ${String.fromCharCode(65 + index)} | ${step.text} |  |`);
  });
  l.push('');
  l.push('### 4.2 Which rule was broken');
  l.push('');
  l.push('For each case, write the code of the **first** rule the operator broke.');
  l.push('');
  for (const scenario of s4.scenarios) {
    l.push(`**Case ${scenario.number}.** ${scenario.text}`);
    l.push('');
  }
  l.push('| Case | Rule broken |');
  l.push('| ---: | --- |');
  for (const scenario of s4.scenarios) l.push(`| ${scenario.number} |  |`);
  l.push('');
  l.push('---');
  l.push('');

  // Section 5
  l.push('## Section 5 — Work the queue');
  l.push('');
  l.push('Suggested time: 12 minutes. Rules in play: all.');
  l.push('');
  l.push('For each request choose **one** action and **one** reason code.');
  l.push('');
  l.push('Actions:');
  l.push('');
  l.push('- `APPROVE` — the operation may be processed as it stands.');
  l.push('- `REJECT` — the operation must not be processed and the reason is already clear.');
  l.push('- `STOP AND ESCALATE` — the evidence does not allow a decision; hand the case to a');
  l.push('  supervisor without executing anything.');
  l.push('');
  l.push('Reason codes:');
  l.push('');
  for (const [code, text] of REASONS) l.push(`- \`${code}\` — ${text}`);
  l.push('');
  l.push('### Queue');
  l.push('');
  for (const item of s5) {
    l.push(`**Request ${item.number}.** ${item.text}`);
    l.push('');
  }
  l.push('### ANSWER SHEET — Section 5');
  l.push('');
  l.push('| Request | Action | Reason |');
  l.push('| ---: | --- | --- |');
  for (const item of s5) l.push(`| ${item.number} |  |  |`);
  l.push('');
  l.push('---');
  l.push('');

  // Section 6
  l.push('## Section 6 — Exact transcription');
  l.push('');
  l.push('Suggested time: 3 minutes.');
  l.push('');
  l.push('Copy each account exactly as printed. One different character invalidates the');
  l.push('answer.');
  l.push('');
  l.push('| # | Printed | Your copy |');
  l.push('| ---: | --- | --- |');
  s6.forEach((id, index) => l.push(`| ${index + 1} | \`${id}\` |  |`));
  l.push('');
  l.push('---');
  l.push('');
  l.push('End of test. Check that you have left no row blank.');
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// Evaluator key
// ---------------------------------------------------------------------------

function renderKey({ s1, s2, s3, s4, s5, s6 }) {
  const l = [];
  l.push(`# Evaluator key — Operator Technical Test, Form ${FORM}`);
  l.push('');
  l.push('**Internal document. Do not hand to the candidate.**');
  l.push('');
  l.push(`Generated with: \`node scripts/generate-operator-technical-test.mjs ${FORM}\``);
  l.push('');

  l.push('## Section 1 — key');
  l.push('');
  l.push('| # | Requested | Correct answer | Near twins in the registry |');
  l.push('| ---: | --- | --- | --- |');
  s1.lookups.forEach((item, index) => {
    const twins = s1.registry
      .filter((id) => id !== item.query && id.length === item.query.length)
      .map((id) => ({ id, diff: [...id].filter((ch, i) => ch !== item.query[i]).length }))
      .filter((c) => c.diff > 0 && c.diff <= 2)
      .sort((a, b) => a.diff - b.diff)
      .map((c) => `\`${c.id}\` (${c.diff})`)
      .join(', ');
    l.push(`| ${index + 1} | \`${item.query}\` | ${item.answer} | ${twins || '—'} |`);
  });
  l.push('');

  l.push('## Section 2 — key');
  l.push('');
  l.push('| # | Customer | Balance | Held | Requested | Available | Decision | Note |');
  l.push('| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |');
  const NOTE = {
    trap: 'trap — fits Balance, not Available',
    boundary: 'boundary — exactly Available',
    clear: 'clearly payable',
  };
  s2.forEach((row, index) => {
    l.push(
      `| ${index + 1} | ${row.customer} | ${row.balance} | ${row.held} | ${row.requested} | ` +
        `**${row.available}** | **${row.decision}** | ${NOTE[row.kind]} |`,
    );
  });
  l.push('');
  l.push('A candidate who ignores Held will answer PROCEED on every trap row. That is the');
  l.push('single most diagnostic mistake in this section.');
  l.push('');

  l.push('## Section 3 — key');
  l.push('');
  l.push(`1. Game action with no Backend decision: ${s3.key.noBackendDecision.join(', ')}`);
  l.push(`2. Backend decision with no game action: ${s3.key.noGameAction.join(', ')}`);
  l.push(`3. Settled twice in the Backend: ${s3.key.settledTwice.join(', ')}`);
  l.push(`4. Amounts disagree: ${s3.key.amountMismatch.join(', ')} (250 vs 520, and 140 vs 145)`);
  l.push('');
  l.push('Five discrepancies in total. Any other reference is a false positive.');
  l.push('');

  l.push('## Section 4 — key');
  l.push('');
  l.push('### 4.1 Correct order');
  l.push('');
  l.push('| Letter | Correct number | Step |');
  l.push('| --- | ---: | --- |');
  s4.scrambled.forEach((step, index) => {
    l.push(`| ${String.fromCharCode(65 + index)} | **${step.position}** | ${step.text} |`);
  });
  l.push('');
  l.push('Score one point per step placed in the correct position.');
  l.push('');
  l.push('### 4.2 Rule broken');
  l.push('');
  l.push('| Case | Rule | Why |');
  l.push('| ---: | --- | --- |');
  for (const scenario of s4.scenarios) {
    const rule = RULES.find(([code]) => code === scenario.rule);
    l.push(`| ${scenario.number} | **${scenario.rule}** | ${rule[1].split('.')[0]}. |`);
  }
  l.push('');

  l.push('## Section 5 — key');
  l.push('');
  l.push('| Request | Correct action | Reason | Critical |');
  l.push('| ---: | --- | --- | --- |');
  for (const item of s5) {
    l.push(`| ${item.number} | ${item.action} | ${item.reason} | ${item.critical ? '**yes**' : 'no'} |`);
  }
  l.push('');
  l.push('A critical case is one where the evidence does not permit action. Answering');
  l.push('`APPROVE` on a critical case is a critical failure.');
  l.push('');

  l.push('## Section 6 — key');
  l.push('');
  s6.forEach((id, index) => l.push(`${index + 1}. \`${id}\``));
  l.push('');
  l.push('Exact character-for-character match only.');
  l.push('');

  l.push('## Scoring');
  l.push('');
  l.push('| Section | Item | Points |');
  l.push('| --- | --- | ---: |');
  l.push(`| 1 | Correct row or NOT PRESENT (2 each) | ${POINTS.s1} |`);
  l.push(`| 2 | Available correct (1) + decision correct (1), per row | ${POINTS.s2} |`);
  l.push(`| 3 | Discrepancy in the right category (2 each) | ${POINTS.s3} |`);
  l.push('| 3 | **Penalty:** reference listed that does not belong | −2 each |');
  l.push(`| 4 | Step in the correct position (1 each) + rule identified (2 each) | ${POINTS.s4} |`);
  l.push(`| 5 | Action correct (2) + reason correct (1), per request | ${POINTS.s5} |`);
  l.push(`| 6 | Exact transcription (1 each) | ${POINTS.s6} |`);
  l.push(`| | **Total** | **${POINTS_TOTAL}** |`);
  l.push('');
  l.push('No section score drops below 0 from penalties.');
  l.push('');

  l.push('## Ability profile');
  l.push('');
  l.push('Record the five sub-scores separately. The total alone does not say where the');
  l.push('person needs support during training.');
  l.push('');
  l.push('| Profile | Sections | Max | What it predicts in the simulator |');
  l.push('| --- | --- | ---: | --- |');
  l.push(`| Exact matching | 1 + 6 | ${POINTS.s1 + POINTS.s6} | Finding and pasting the exact player; not confusing near-identical accounts |`);
  l.push(`| Reading account state | 2 | ${POINTS.s2} | Respecting held funds and game balance before committing a movement |`);
  l.push(`| Cross-record reconciliation | 3 | ${POINTS.s3} | Game history against Backend history; duplicates and unsettled actions |`);
  l.push(`| Procedure discipline | 4 | ${POINTS.s4} | Verifying before mutating; one game action, one Backend decision |`);
  l.push(`| Judgment and safe stop | 5 | ${POINTS.s5} | Approve, cancel with a reason, or refuse to act on bad evidence |`);
  l.push('');

  l.push('## Critical failure');
  l.push('');
  l.push('Answering `APPROVE` on any critical case in Section 5 invalidates the result,');
  l.push('whatever the total. Someone who processes an operation with contradictory');
  l.push('evidence or a mismatched account causes a real loss; no amount of accuracy');
  l.push('elsewhere offsets it.');
  l.push('');

  l.push('## Suggested thresholds');
  l.push('');
  l.push('**PROPOSED — not approved.** Do not present these cuts as a hiring decision');
  l.push('rule until they have been calibrated against real cohort results.');
  l.push('');
  l.push('| Outcome | Condition |');
  l.push('| --- | --- |');
  l.push('| Suitable | Total >= 80% and every profile >= 70% and no critical failure |');
  l.push('| Suitable with reservations | Total 65–79% and no critical failure |');
  l.push('| Not suitable | Total < 65%, or any critical failure |');
  l.push('');
  l.push('"Suitable with reservations" is not a rejection: it names the profile to');
  l.push('reinforce during the first modules.');
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const test = {
  s1: buildSection1(),
  s2: buildSection2(),
  s3: buildSection3(),
  s4: buildSection4(),
  s5: buildSection5(),
  s6: buildSection6(),
};

mkdirSync(OUT_DIR, { recursive: true });
const bookletPath = join(OUT_DIR, `operator-technical-test-FORM-${FORM}.md`);
const keyPath = join(OUT_DIR, `operator-technical-test-FORM-${FORM}-KEY.md`);

writeFileSync(bookletPath, renderBooklet(test), 'utf8');
writeFileSync(keyPath, renderKey(test), 'utf8');

console.log(`Form ${FORM} generated:`);
console.log(`  booklet: ${bookletPath}`);
console.log(`  key:     ${keyPath}`);
console.log(`  maximum score: ${POINTS_TOTAL}`);
