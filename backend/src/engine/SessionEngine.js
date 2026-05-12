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
