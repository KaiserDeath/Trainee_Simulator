-- Local-only age fixture. Call inside the guarded verification runner.
CREATE FUNCTION pg_temp.age_formal(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE sessions UUID[];
BEGIN
 SELECT array_agg(session_id) INTO sessions FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt;
 EXECUTE 'SET LOCAL session_replication_role=replica';
 UPDATE public.hub_scored_evaluation_attempts SET started_at=now()-interval '3 years',created_at=now()-interval '3 years',expires_at=now()-interval '3 years'+interval '30 minutes',completed_at=now()-interval '3 years'+interval '1 minute',submitted_at=CASE WHEN submitted_at IS NOT NULL THEN now()-interval '3 years'+interval '2 minutes' END WHERE id=p_attempt;
 UPDATE public.hub_evaluation_runtime SET created_at=now()-interval '3 years' WHERE attempt_id=p_attempt;
 UPDATE public.hub_evaluation_action_evidence SET created_at=now()-interval '3 years',retention_until=now()-interval '1 year' WHERE attempt_id=p_attempt;
 UPDATE public.hub_final_stage_evidence SET created_at=now()-interval '3 years',retention_until=now()-interval '1 year' WHERE attempt_id=p_attempt;
 UPDATE public.hub_scored_evaluation_item_results SET created_at=now()-interval '3 years' WHERE attempt_id=p_attempt;
 UPDATE public.hub_operation_evidence SET captured_at=now()-interval '3 years',retention_until=now()-interval '1 year' WHERE session_id=ANY(sessions);
 UPDATE public.sandbox_game_history SET created_at=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.sandbox_operations SET created_at=now()-interval '3 years',processed_at=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.trainee_sessions SET started_at=now()-interval '3 years',ended_at=now()-interval '3 years'+interval '1 minute' WHERE id=ANY(sessions);
 UPDATE public.sandbox_customers SET created_at=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.sandbox_game_accounts SET created_at=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.sandbox_transaction_history SET created_at=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.trainee_action_logs SET created_at=now()-interval '3 years',"timestamp"=now()-interval '3 years' WHERE session_id=ANY(sessions);
 UPDATE public.hub_idempotency_keys k SET created_at=now()-interval '3 years' FROM public.hub_formal_retry_lineage l WHERE l.attempt_id=p_attempt AND k.identity_id=l.identity_id AND k.action_code=l.action_code AND k.idempotency_key=l.idempotency_key;
 EXECUTE 'SET LOCAL session_replication_role=origin';
END; $$;
