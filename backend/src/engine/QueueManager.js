import { supabase }
  from '../config/supabase.js';

export const QUEUE_LIMITS = {
  maxPendingOperations: 15,
  generationIntervalMs: 30000,
  minGeneratedOperations: 1,
  maxGeneratedOperations: 2
};

export async function getPendingCount(
  sessionId
) {
  const { count, error } = await supabase
    .from('sandbox_operations')
    .select('id', {
      count: 'exact',
      head: true
    })
    .eq('session_id', sessionId)
    .eq('status', 'PENDING');

  if (error) {
    throw error;
  }

  return count || 0;
}

export function canGenerateOperations(
  pendingCount
) {
  return (
    pendingCount <
    QUEUE_LIMITS.maxPendingOperations
  );
}

export function getGenerationVolume() {
  const range =
    QUEUE_LIMITS.maxGeneratedOperations -
    QUEUE_LIMITS.minGeneratedOperations +
    1;

  return (
    Math.floor(
      Math.random() * range
    ) +
    QUEUE_LIMITS.minGeneratedOperations
  );
}
