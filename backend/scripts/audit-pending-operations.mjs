import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const envFile = process.env.TREZ_AUDIT_ENV_FILE;

if (!envFile) {
  throw new Error('TREZ_AUDIT_ENV_FILE must identify the audited backend .env.');
}

const configuration = dotenv.parse(readFileSync(envFile));
const supabaseUrl = configuration.SUPABASE_URL;
const supabaseKey = configuration.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('The audit environment is missing its Supabase configuration.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const PAGE_SIZE = 500;

async function readAll(table, columns, configure = query => query) {
  const rows = [];
  let expectedCount = null;

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(columns, { count: from === 0 ? 'exact' : undefined })
      .range(from, from + PAGE_SIZE - 1);

    query = configure(query);
    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Read-only ${table} query failed: ${error.message}`);
    }

    if (from === 0) expectedCount = count;
    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
  }

  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(
      `Read-only ${table} pagination returned ${rows.length} of ${expectedCount} rows.`,
    );
  }

  return rows;
}

const operations = await readAll(
  'sandbox_operations',
  'id,session_id,customer_id,game_account_id,type,status,amount,created_at,customer_balance_at_request',
  query => query.eq('status', 'PENDING').order('created_at', { ascending: true }),
);

const sessions = await readAll(
  'trainee_sessions',
  'id,status,started_at,ended_at',
);

const gameAccounts = await readAll(
  'sandbox_game_accounts',
  'id,session_id,customer_id,game,balance',
);

const customers = await readAll(
  'sandbox_customers',
  'id,session_id,balance',
);

const auditTime = new Date();
const sessionById = new Map(sessions.map(session => [session.id, session]));
const gameAccountById = new Map(gameAccounts.map(account => [account.id, account]));
const customerById = new Map(customers.map(customer => [customer.id, customer]));

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => {
      return String(left[0]).localeCompare(String(right[0]));
    }),
  );
}

function finiteAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function ageBucket(createdAt) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 'invalid_or_missing';

  const hours = (auditTime.getTime() - timestamp) / 3_600_000;
  if (hours < 0) return 'future_timestamp';
  if (hours < 1) return 'under_1_hour';
  if (hours < 24) return '1_to_24_hours';
  if (hours < 24 * 7) return '1_to_7_days';
  if (hours < 24 * 30) return '7_to_30_days';
  if (hours < 24 * 90) return '30_to_90_days';
  return '90_days_or_more';
}

function duplicateSummary(groups) {
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  const sizeDistribution = new Map();
  for (const group of duplicates) increment(sizeDistribution, String(group.length));
  return {
    duplicateSlotCount: duplicates.length,
    affectedOperationCount: duplicates.reduce((sum, group) => sum + group.length, 0),
    excessOperationCount: duplicates.reduce((sum, group) => sum + group.length - 1, 0),
    maximumOperationsInOneSlot: duplicates.reduce(
      (maximum, group) => Math.max(maximum, group.length),
      0,
    ),
    duplicateSlotSizeDistribution: sortedCounts(sizeDistribution),
  };
}

const bySessionStatus = new Map();
const byOperationType = new Map();
const byAge = new Map();

for (const operation of operations) {
  increment(
    bySessionStatus,
    sessionById.get(operation.session_id)?.status || 'MISSING_SESSION',
  );
  increment(byOperationType, operation.type || 'MISSING_TYPE');
  increment(byAge, ageBucket(operation.created_at));
}

const movementTypes = new Set(['ADD CREDITS', 'WITHDRAW CREDITS']);
const requestTypes = new Set([
  'CREATE ACCOUNT',
  'REFRESH BALANCE',
  'RESET PASSWORD',
]);

const movementGroups = new Map();
const requestGroups = new Map();
const gameResolution = new Map();

for (const operation of operations) {
  if (movementTypes.has(operation.type)) {
    const key = `${operation.session_id}:${operation.customer_id}`;
    if (!movementGroups.has(key)) movementGroups.set(key, []);
    movementGroups.get(key).push(operation);
  }

  if (requestTypes.has(operation.type)) {
    const directGame = String(operation.game || '').trim();
    const derivedGame = String(
      gameAccountById.get(operation.game_account_id)?.game || '',
    ).trim();
    const game = directGame || derivedGame;
    const source = directGame ? 'operation' : derivedGame ? 'game_account' : 'unresolved';
    increment(gameResolution, source);

    if (game) {
      const key = `${operation.session_id}:${operation.customer_id}:${game}`;
      if (!requestGroups.has(key)) requestGroups.set(key, []);
      requestGroups.get(key).push(operation);
    }
  }
}

const addCredits = operations.filter(operation => operation.type === 'ADD CREDITS');
const addGroups = new Map();
let invalidAddAmountCount = 0;
let totalPendingAddAmount = 0;
let individualAmountAboveCurrentBalanceCount = 0;
let individualAmountAboveRequestSnapshotCount = 0;
let missingCustomerCount = 0;
let requestSnapshotPresentCount = 0;

for (const operation of addCredits) {
  const amount = finiteAmount(operation.amount);
  if (amount === null) invalidAddAmountCount += 1;
  else totalPendingAddAmount += amount;

  const customer = customerById.get(operation.customer_id);
  if (!customer) missingCustomerCount += 1;

  const currentBalance = finiteAmount(customer?.balance);
  if (amount !== null && currentBalance !== null && amount > currentBalance) {
    individualAmountAboveCurrentBalanceCount += 1;
  }

  const requestBalance = finiteAmount(operation.customer_balance_at_request);
  if (requestBalance !== null) requestSnapshotPresentCount += 1;
  if (amount !== null && requestBalance !== null && amount > requestBalance) {
    individualAmountAboveRequestSnapshotCount += 1;
  }

  const key = `${operation.session_id}:${operation.customer_id}`;
  if (!addGroups.has(key)) addGroups.set(key, []);
  addGroups.get(key).push(operation);
}

let groupsAboveCurrentBalance = 0;
let pendingAmountInGroupsAboveCurrentBalance = 0;
let currentBalanceForGroupsAboveCurrentBalance = 0;
let aggregateOverageAboveCurrentBalance = 0;
let groupsWithoutCurrentBalance = 0;
let totalCurrentBalanceAcrossSlots = 0;
let totalRemainingHeadroom = 0;
let minimumRemainingHeadroom = null;
let maximumPendingAmountInOneSlot = 0;

for (const group of addGroups.values()) {
  const pendingAmount = group.reduce((sum, operation) => {
    return sum + (finiteAmount(operation.amount) || 0);
  }, 0);
  const currentBalance = finiteAmount(
    customerById.get(group[0].customer_id)?.balance,
  );
  maximumPendingAmountInOneSlot = Math.max(
    maximumPendingAmountInOneSlot,
    pendingAmount,
  );

  if (currentBalance === null) {
    groupsWithoutCurrentBalance += 1;
  } else {
    const headroom = currentBalance - pendingAmount;
    totalCurrentBalanceAcrossSlots += currentBalance;
    totalRemainingHeadroom += headroom;
    minimumRemainingHeadroom =
      minimumRemainingHeadroom === null
        ? headroom
        : Math.min(minimumRemainingHeadroom, headroom);

    if (pendingAmount > currentBalance) {
      groupsAboveCurrentBalance += 1;
      pendingAmountInGroupsAboveCurrentBalance += pendingAmount;
      currentBalanceForGroupsAboveCurrentBalance += currentBalance;
      aggregateOverageAboveCurrentBalance += pendingAmount - currentBalance;
    }
  }
}

const createdTimes = operations
  .map(operation => new Date(operation.created_at).getTime())
  .filter(Number.isFinite);

const result = {
  auditTimestamp: auditTime.toISOString(),
  scope: {
    pendingOperationCount: operations.length,
    oldestPendingCreatedAt:
      createdTimes.length > 0 ? new Date(Math.min(...createdTimes)).toISOString() : null,
    newestPendingCreatedAt:
      createdTimes.length > 0 ? new Date(Math.max(...createdTimes)).toISOString() : null,
    sessionRowsRead: sessions.length,
    gameAccountRowsRead: gameAccounts.length,
    customerRowsRead: customers.length,
  },
  countsBySessionStatus: sortedCounts(bySessionStatus),
  countsByOperationType: sortedCounts(byOperationType),
  countsByAgeBucket: sortedCounts(byAge),
  duplicateMovementCustomerSlots: duplicateSummary(movementGroups),
  requestGameResolution: sortedCounts(gameResolution),
  duplicateRequestCustomerGameSlots: duplicateSummary(requestGroups),
  addCreditsBalanceExposure: {
    operationCount: addCredits.length,
    customerSlotCount: addGroups.size,
    totalPendingAmount: Number(totalPendingAddAmount.toFixed(2)),
    totalCurrentBalanceAcrossCustomerSlots: Number(
      totalCurrentBalanceAcrossSlots.toFixed(2),
    ),
    aggregateRemainingHeadroom: Number(totalRemainingHeadroom.toFixed(2)),
    minimumRemainingHeadroom: Number(minimumRemainingHeadroom?.toFixed(2)),
    maximumPendingAmountInOneCustomerSlot: Number(
      maximumPendingAmountInOneSlot.toFixed(2),
    ),
    invalidAmountCount: invalidAddAmountCount,
    missingCustomerCount,
    requestSnapshotPresentCount,
    individualAmountAboveCurrentBalanceCount,
    individualAmountAboveRequestSnapshotCount,
    customerSlotsAboveCurrentBalance: groupsAboveCurrentBalance,
    pendingAmountInSlotsAboveCurrentBalance: Number(
      pendingAmountInGroupsAboveCurrentBalance.toFixed(2),
    ),
    currentBalanceInSlotsAboveCurrentBalance: Number(
      currentBalanceForGroupsAboveCurrentBalance.toFixed(2),
    ),
    aggregateOverageAboveCurrentBalance: Number(
      aggregateOverageAboveCurrentBalance.toFixed(2),
    ),
    customerSlotsWithoutCurrentBalance: groupsWithoutCurrentBalance,
    duplicateAddCreditCustomerSlots: duplicateSummary(addGroups),
  },
};

console.log(JSON.stringify(result, null, 2));
