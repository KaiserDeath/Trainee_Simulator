-- Capture the existing scorer's verdict in the same transaction as settlement.
-- No historical backfill: old mutable evidence cannot become an original snapshot.
ALTER TABLE public.sandbox_operations ADD COLUMN final_evidence_snapshot JSONB;
CREATE TABLE public.hub_operation_evidence (
  id UUID PRIMARY KEY, session_id UUID NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 years',
  snapshot JSONB NOT NULL
);
CREATE INDEX hub_operation_evidence_session_idx ON public.hub_operation_evidence(session_id,id);
CREATE TRIGGER hub_operation_evidence_append_only BEFORE UPDATE OR DELETE ON public.hub_operation_evidence
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE FUNCTION public.hub_capture_operation_evidence() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_game JSONB; v_customer JSONB; v_history JSONB;
BEGIN
  IF OLD.final_evidence_snapshot IS NOT NULL THEN
    IF NEW.final_evidence_snapshot IS DISTINCT FROM OLD.final_evidence_snapshot THEN RAISE EXCEPTION 'HUB_SNAPSHOT_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='PENDING' AND NEW.status IN ('APPROVED','CANCELLED') THEN
    SELECT jsonb_build_object('id',id,'game',game,'game_username',game_username,'balance',balance)
      INTO v_game FROM public.sandbox_game_accounts WHERE id=NEW.game_account_id;
    SELECT jsonb_build_object('id',id,'username',username,'first_name',first_name,'last_name',last_name,'balance',balance)
      INTO v_customer FROM public.sandbox_customers WHERE id=NEW.customer_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'amount',amount,'createdAt',created_at,'accountId',game_account_id) ORDER BY created_at,id),'[]')
      INTO v_history FROM public.sandbox_game_history WHERE session_id=NEW.session_id AND game_account_id=NEW.game_account_id AND created_at>=NEW.created_at;
    NEW.final_evidence_snapshot:=jsonb_build_object('version',1,'scorerVersion','existing-operation-scorer-v1',
      'operationId',NEW.id,'type',NEW.type,'game',NEW.game,'status',NEW.status,'isCorrect',NEW.is_correct,
      'amount',NEW.amount,'requestedAt',NEW.created_at,'processedAt',NEW.processed_at,
      'gameAccount',v_game,'customer',v_customer,'gameHistory',v_history,
      'reservationStatus',NEW.customer_reservation_status,'movementScenario',NEW.movement_scenario,
      'customerBalanceAtRequest',NEW.customer_balance_at_request,'gameBalanceAtRequest',NEW.game_balance_at_request);
    INSERT INTO public.hub_operation_evidence(id,session_id,snapshot) VALUES(NEW.id,NEW.session_id,NEW.final_evidence_snapshot);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_operation_settlement_snapshot BEFORE UPDATE ON public.sandbox_operations
FOR EACH ROW EXECUTE FUNCTION public.hub_capture_operation_evidence();
ALTER TABLE public.hub_operation_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_operation_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_operation_evidence TO service_role;
REVOKE ALL ON FUNCTION public.hub_capture_operation_evidence() FROM PUBLIC,anon,authenticated;
