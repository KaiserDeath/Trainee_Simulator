import { supabase }
  from '../config/supabase.js';

import {
  buildOperationBreakdown,
  buildSessionPerformance
} from '../services/scoringService.js';

export async function getSessionById(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Session not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

export async function getSessionOperations(
  sessionId
) {
  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(`
      *,
      customer:sandbox_customers(
        username
      ),
      game_account:sandbox_game_accounts(
        game
      )
    `)
    .eq('session_id', sessionId);

  if (error) {
    throw error;
  }

  return data;
}

export async function buildSessionReport(
  sessionId
) {
  const session =
    await getSessionById(sessionId);

  const operations =
    await getSessionOperations(
      sessionId
    );

  return {
    session: {
      id: session.id,
      trainee_name:
        session.trainee_name,
      started_at:
        session.started_at,
      ended_at:
        session.ended_at,
      status: session.status
    },
    performance:
      buildSessionPerformance(
        operations
      ),
    operationBreakdown:
      buildOperationBreakdown(
        operations
      ),
    operations
  };
}

export async function completeSession(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .update({
      status: 'completed',
      ended_at: new Date()
        .toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function submitSession(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .update({
      status: 'submitted',
      ended_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSession(
  sessionId
) {
  const { error: historyError } = await supabase
    .from('sandbox_transaction_history')
    .delete()
    .eq('session_id', sessionId);

  if (historyError) {
    throw historyError;
  }

  const { error: operationsError } = await supabase
    .from('sandbox_operations')
    .delete()
    .eq('session_id', sessionId);

  if (operationsError) {
    throw operationsError;
  }

  const { error: accountsError } = await supabase
    .from('sandbox_game_accounts')
    .delete()
    .eq('session_id', sessionId);

  if (accountsError) {
    throw accountsError;
  }

  const { error: customersError } = await supabase
    .from('sandbox_customers')
    .delete()
    .eq('session_id', sessionId);

  if (customersError) {
    throw customersError;
  }

  const { data, error } = await supabase
    .from('trainee_sessions')
    .delete()
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSessionsWithoutActivity() {
  const { data: sessions, error } = await supabase
    .from('trainee_sessions')
    .select('id');

  if (error) {
    throw error;
  }

  const deletedIds = [];

  for (const session of sessions) {
    const { data: operations, error: opError } = await supabase
      .from('sandbox_operations')
      .select('id')
      .eq('session_id', session.id)
      .limit(1);

    if (opError) {
      throw opError;
    }

    if (!operations || operations.length === 0) {
      await deleteSession(session.id);
      deletedIds.push(session.id);
    }
  }

  return deletedIds;
}
