// backend/src/controllers/operationController.js or similar service file

export const processOperation = async (req, res) => {
  const { id } = req.params;
  const { status, rollbackReason } = req.body; // e.g., 'COMPLETED', 'FAILED'
  
  try {
    const processedAt = new Date().toISOString();

    // 1. Update the actual operation record (for the final Business Report)
    const { data: operation, error } = await supabase
      .from('sandbox_operations')
      .update({ 
        status, 
        rollback_reason: rollbackReason,
        processed_at: processedAt // <--- This locks the exact moment it is resolved!
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // 2. Also record a detailed event stream (for the Granular Audit Logs)
    const logActionType = status === 'COMPLETED' ? 'OPERATION_ACCEPTED' : 'OPERATION_REJECTED';
    
    await supabase
      .from('trainee_action_logs')
      .insert({
        session_id: operation.session_id,
        operation_id: operation.id,
        action_type: logActionType,
        timestamp: processedAt,
        details: {
          operation_type: operation.type,
          amount: operation.amount,
          status: status
        }
      });

    return res.status(200).json({ success: true, operation });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};