import { supabase }
  from '../config/supabase.js';

import { buildIlikeFilter }
  from '../utils/search.js';
import { CUSTOMER_MOVEMENT_HISTORY_TABLE }
  from '../domain/historyStores.js';
import {
  filterBackendHistoryRows,
  GAME_HISTORY_TYPE_PATTERN
} from './historyPolicy.js';

export async function searchSessionCustomers({
  sessionId,
  query = ''
}) {
  let request = supabase
    .from('sandbox_customers')
    .select(`
      *,
      game_accounts:sandbox_game_accounts(
        id,
        game,
        game_username,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .order('username', {
      ascending: true
    });

  const searchFilter = buildIlikeFilter(
    [
      'username',
      'first_name',
      'last_name',
      'email'
    ],
    query
  );

  if (searchFilter) {
    request = request.or(searchFilter);
  }

  const { data, error } =
    await request;

  if (error) {
    throw error;
  }

  return data;
}

export async function getCustomerProfile({
  sessionId,
  customerId
}) {
  const { data, error } = await supabase
    .from('sandbox_customers')
    .select(`
      *,
      game_accounts:sandbox_game_accounts(
        id,
        game,
        game_username,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .eq('id', customerId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Customer not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

function parseHistoryDetails(description) {
  try {
    const parsed = JSON.parse(description || '{}');
    if (parsed && (parsed.kind === 'MOVEMENT_HISTORY' || parsed.kind === 'GAME_HISTORY' || parsed.operationCode || parsed.playerId || parsed.mobileId)) {
      return parsed;
    }
  } catch {
    // Description is plain text
  }
  return null;
}

function inferGameFromDescription(description = '', type = '') {
  const value = String(description);
  if (value.includes('Orion Stars')) return 'Orion Stars';
  if (value.includes('Vblink')) return 'Vblink';
  if (value.includes('Golden Dragon')) return 'Golden Dragon';
  if (value.includes('Glamour Spin')) return 'Glamour Spin';
  if (value.includes('Golden Treasure')) return 'Golden Treasure';
  if (value.includes('River Sweeps')) return 'River Sweeps';
  if (value.includes('Ultra Panda')) return 'Ultra Panda';
  if (value.includes('Yolo')) return 'Yolo';
  return 'Sandbox';
}

function normalizeCustomerHistoryItem(item, gameAccounts = []) {
  const details = parseHistoryDetails(item.description);

  const game = details?.game || inferGameFromDescription(item.description, item.type);

  let gameUsername = details?.playerId || details?.mobileId || details?.mobile_id || item.game_username;

  if (!gameUsername && game && gameAccounts.length > 0) {
    const matchedAccount = gameAccounts.find(
      acc => String(acc.game).toLowerCase() === String(game).toLowerCase()
    );
    if (matchedAccount) {
      gameUsername = matchedAccount.game_username;
    }
  }

  if (!gameUsername) {
    if (gameAccounts.length > 0) {
      gameUsername = gameAccounts[0].game_username;
    } else {
      gameUsername = '—';
    }
  }

  const operationCode =
    details?.operationCode ||
    details?.operation_code ||
    String(item.id || '').slice(0, 8).toUpperCase() ||
    '—';

  const manager = details?.manager || details?.processed_by || 'TrainingStore';
  
  let extractedManager = manager;
  if (!details && item.description) {
    const managerMatch = item.description.match(/by\s+([^.]+)\./i);
    if (managerMatch) {
      extractedManager = managerMatch[1].trim();
    }
  }

  let status = details?.status || 'APPROVED';
  if (!details && item.description) {
    if (item.description.includes('APPROVED')) {
      status = 'APPROVED';
    } else if (item.description.includes('CANCELLED')) {
      status = 'CANCELLED';
    } else if (item.description.includes('REJECTED')) {
      status = 'REJECTED';
    }
  }

  const requestedAt = details?.requestedAt || details?.requested_at || item.created_at;
  const acceptedAt = details?.acceptedAt || details?.accepted_at || details?.executedAt || item.created_at;

  return {
    ...item,
    operation_code: operationCode,
    operationCode: operationCode,
    game: game,
    game_username: gameUsername,
    gameUsername: gameUsername,
    mobile_id: gameUsername,
    mobileId: gameUsername,
    manager: extractedManager,
    processed_by: extractedManager,
    processedBy: extractedManager,
    status: status,
    requested_at: requestedAt,
    requestedAt: requestedAt,
    processed_at: acceptedAt,
    processedAt: acceptedAt,
    approved_at: acceptedAt,
    approvedAt: acceptedAt,
  };
}

export async function getCustomerHistory({
  sessionId,
  customerId
}) {
  const { data, error } = await supabase
    .from(CUSTOMER_MOVEMENT_HISTORY_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId)
    .not(
      'type',
      'like',
      GAME_HISTORY_TYPE_PATTERN
    )
    .order('created_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  const { data: gameAccounts } = await supabase
    .from('sandbox_game_accounts')
    .select('game, game_username')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId);

  return filterBackendHistoryRows(data)
    .map(item =>
      normalizeCustomerHistoryItem(
        item,
        gameAccounts || []
      )
    );
}
