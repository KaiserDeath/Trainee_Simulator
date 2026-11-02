CREATE TABLE public.hub_exception_practice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),identity_id UUID NOT NULL REFERENCES public.hub_identities(id),
  activity_attempt_id UUID NOT NULL REFERENCES public.hub_activity_attempts(id),
  session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL UNIQUE REFERENCES public.sandbox_operations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hub_exception_activity_idx ON public.hub_exception_practice(identity_id,activity_attempt_id,created_at);
UPDATE public.hub_activities SET content=(content-'blockedReason')||'{"policyStatus":"approved","executionKind":"exception_decision"}'::jsonb WHERE stable_code='exceptional-operations-policy-gated-practice';
CREATE FUNCTION public.hub_exception_practice_view(p_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
SELECT jsonb_build_object('id',c.id,'game',o.game,'identifier',g.game_username,'amount',o.amount,
  'status',o.status,'scenario',o.movement_scenario,'credit',g.balance,'creditAtRequest',o.game_balance_at_request,
  'result',CASE WHEN o.status<>'PENDING' THEN o.is_correct END,
  'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'type',h.type,'amount',h.amount,'createdAt',h.created_at) ORDER BY h.created_at,h.id)
    FROM public.sandbox_game_history h WHERE h.session_id=c.session_id AND h.game_account_id=g.id),'[]'::jsonb))
FROM public.hub_exception_practice c JOIN public.sandbox_operations o ON o.id=c.operation_id
JOIN public.sandbox_game_accounts g ON g.id=o.game_account_id WHERE c.id=p_id;
$$;
CREATE FUNCTION public.hub_exception_practice_command(p_external_subject TEXT,p_activity_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor UUID;v_start JSONB;v_context public.hub_exception_practice%ROWTYPE;
  v_claim public.hub_idempotency_keys%ROWTYPE;v_fingerprint TEXT;v_result JSONB;
  v_session UUID;v_customer UUID;v_account UUID;v_operation public.sandbox_operations%ROWTYPE;
  v_scenario TEXT;v_applied BOOLEAN;v_name TEXT;v_enrolment UUID;
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
  IF p_command IS NULL OR p_command NOT IN ('start','answer') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_activities WHERE id=p_activity_id AND content->>'executionKind'='exception_decision') THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
  SELECT e.id INTO v_enrolment FROM public.hub_enrolments e JOIN public.hub_modules m ON m.course_id=e.course_id
    JOIN public.hub_activities a ON a.module_id=m.id WHERE a.id=p_activity_id AND e.identity_id=v_actor AND e.status<>'withdrawn' FOR UPDATE OF e;
  IF v_enrolment IS NULL THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED'; END IF;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('activity',p_activity_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
  INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(v_actor,'exception_practice',p_idempotency_key,v_fingerprint) ON CONFLICT DO NOTHING;
  SELECT * INTO v_claim FROM public.hub_idempotency_keys WHERE identity_id=v_actor AND action_code='exception_practice' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_claim.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT'; END IF;
  IF v_claim.response IS NOT NULL THEN RETURN v_claim.response; END IF;
  SELECT c.* INTO v_context FROM public.hub_exception_practice c JOIN public.hub_activity_attempts a ON a.id=c.activity_attempt_id
    WHERE c.identity_id=v_actor AND a.activity_id=p_activity_id ORDER BY c.created_at DESC,c.id DESC LIMIT 1;
  IF v_context.id IS NOT NULL THEN SELECT * INTO v_operation FROM public.sandbox_operations WHERE id=v_context.operation_id; END IF;
  IF p_command='start' AND v_context.id IS NOT NULL AND (v_operation.status='PENDING' OR v_operation.is_correct) THEN
    v_result:=public.hub_exception_practice_view(v_context.id);
  ELSE
    v_start:=public.hub_start_activity_attempt(p_external_subject,p_activity_id,'{}',p_idempotency_key);
    IF p_command='start' THEN
      INSERT INTO public.trainee_sessions(trainee_name,status,runtime_mode) VALUES('Hub exception practice','active','focused_practice') RETURNING id INTO v_session;
      INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(v_session,'ExceptionCustomer',500) RETURNING id INTO v_customer;
      INSERT INTO public.sandbox_game_wallets(session_id,game,balance) VALUES(v_session,'Orion Stars',20000);
      INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,password,balance)
        VALUES(v_session,v_customer,'Orion Stars','OS_Except123','disposable-fixture',100) RETURNING id INTO v_account;
      SELECT * INTO v_operation FROM public.create_reserved_sandbox_operation(jsonb_build_object('id',gen_random_uuid(),'session_id',v_session,
        'customer_id',v_customer,'game_account_id',v_account,'game','Orion Stars','type','ADD CREDITS','amount',50,'customer_balance_at_request',500,'game_balance_at_request',100,'created_at',now()));
      v_scenario:=(ARRAY['ALREADY_PROCESSED','PLAYER_IN_GAME','PENDING_RECONCILIATION'])[1+floor(random()*3)::integer];
      v_applied:=v_scenario='ALREADY_PROCESSED' OR (v_scenario='PENDING_RECONCILIATION' AND random()<0.5);
      PERFORM public.apply_sandbox_movement_scenario(v_operation.id,v_scenario,v_applied);
      INSERT INTO public.hub_exception_practice(identity_id,activity_attempt_id,session_id,operation_id)
        VALUES(v_actor,(v_start->>'activityAttemptId')::uuid,v_session,v_operation.id) RETURNING * INTO v_context;
      UPDATE public.hub_attempts SET legacy_trainee_session_id=v_session WHERE id=(v_start->>'attemptId')::uuid;
    ELSE
      IF v_context.id IS NULL OR v_operation.status<>'PENDING' THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
      IF coalesce(p_input->>'action','') NOT IN ('APPROVED','CANCELLED') OR length(btrim(coalesce(p_input->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
      SELECT coalesce(display_name,username,external_subject_reference) INTO v_name FROM public.hub_identities WHERE id=v_actor;
      PERFORM public.settle_backend_movement_operation(v_operation.id,p_input->>'action',v_name,p_input->>'reason');
      SELECT * INTO v_operation FROM public.sandbox_operations WHERE id=v_operation.id;
      INSERT INTO public.hub_evidence_events(attempt_id,activity_attempt_id,sequence_number,event_type,occurred_at,payload)
        SELECT (v_start->>'attemptId')::uuid,v_context.activity_attempt_id,coalesce(max(sequence_number),0)+1,'EXCEPTION_PRACTICE_RESULT',now(),
          jsonb_build_object('operationId',v_operation.id,'sourceSessionId',v_context.session_id,'scenario',v_operation.movement_scenario,'isCorrect',v_operation.is_correct,'reason',p_input->>'reason')
        FROM public.hub_evidence_events WHERE attempt_id=(v_start->>'attemptId')::uuid;
      IF v_operation.is_correct THEN
        PERFORM public.hub_complete_activity_attempt(p_external_subject,v_context.activity_attempt_id,
          jsonb_build_object('operationId',v_operation.id,'scenario',v_operation.movement_scenario,'serverVerified',TRUE),p_idempotency_key);
      END IF;
      UPDATE public.trainee_sessions SET status='completed',ended_at=now() WHERE id=v_context.session_id;
    END IF;
    v_result:=public.hub_exception_practice_view(v_context.id);
  END IF;
  UPDATE public.hub_idempotency_keys SET response=v_result WHERE identity_id=v_actor AND action_code='exception_practice' AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END; $$;
CREATE FUNCTION public.hub_guard_exception_completion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status<>'completed' AND EXISTS(SELECT 1 FROM public.hub_activities WHERE id=NEW.activity_id AND content->>'executionKind'='exception_decision')
    AND NOT EXISTS(SELECT 1 FROM public.hub_exception_practice c JOIN public.sandbox_operations o ON o.id=c.operation_id WHERE c.activity_attempt_id=NEW.id AND o.is_correct)
    THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_exception_completion BEFORE UPDATE ON public.hub_activity_attempts FOR EACH ROW EXECUTE FUNCTION public.hub_guard_exception_completion();
ALTER TABLE public.hub_exception_practice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_exception_practice FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_exception_practice TO service_role;
REVOKE ALL ON FUNCTION public.hub_exception_practice_view(UUID),public.hub_exception_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_exception_practice_view(UUID),public.hub_exception_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
