import { supabase } from '../config/supabase.js';

export async function logActionEvent({
  sessionId,
  traineeId,
  traineeName,
  operationId,
  actionType,
  details = null
}) {
  try {
    const { error } = await supabase
      .from('trainee_action_logs')
      .insert({
        session_id: sessionId,
        trainee_id: traineeId,
        trainee_name: traineeName,
        operation_id: operationId,
        action_type: actionType,
        details: details ? JSON.stringify(details) : null,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to log action:', error);
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export async function getSessionActionLog(sessionId) {
  try {
    const { data, error } = await supabase
      .from('trainee_action_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('Failed to fetch action log:', err);
    return [];
  }
}
