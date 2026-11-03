CREATE TABLE public.hub_mixed_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),identity_id UUID NOT NULL REFERENCES public.hub_identities(id),activity_id UUID NOT NULL REFERENCES public.hub_activities(id),
 enrolment_id UUID NOT NULL REFERENCES public.hub_enrolments(id),activity_attempt_id UUID REFERENCES public.hub_activity_attempts(id),
 settings_snapshot JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
 result BOOLEAN,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),completed_at TIMESTAMPTZ,
 CHECK((status='in_progress' AND result IS NULL AND completed_at IS NULL) OR (status<>'in_progress' AND result IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hub_mixed_active_run ON public.hub_mixed_runs(identity_id,activity_id) WHERE status='in_progress';
CREATE TABLE public.hub_mixed_worlds (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),run_id UUID NOT NULL REFERENCES public.hub_mixed_runs(id),sequence_number INTEGER NOT NULL,
 operation_type TEXT NOT NULL,session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id),customer_id UUID NOT NULL REFERENCES public.sandbox_customers(id),
 account_id UUID REFERENCES public.sandbox_game_accounts(id),account_policy_id UUID NOT NULL REFERENCES public.hub_account_policies(id),pending_operation_id UUID NOT NULL REFERENCES public.sandbox_operations(id),
 history_read_at TIMESTAMPTZ,stage_cursor INTEGER NOT NULL DEFAULT 0 CHECK(stage_cursor BETWEEN 0 AND 2),stages_correct BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(run_id,sequence_number)
);
CREATE TABLE public.hub_mixed_stage_evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),run_id UUID NOT NULL REFERENCES public.hub_mixed_runs(id),world_id UUID NOT NULL REFERENCES public.hub_mixed_worlds(id),
 sequence_number INTEGER NOT NULL,stage_number INTEGER NOT NULL,action_code TEXT NOT NULL,is_correct BOOLEAN NOT NULL,evidence JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),retention_until TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 years',UNIQUE(world_id,stage_number)
);
CREATE TRIGGER hub_mixed_stage_immutable BEFORE UPDATE OR DELETE ON public.hub_mixed_stage_evidence FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE FUNCTION public.hub_guard_mixed_run() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 IF OLD.status<>'in_progress' OR NEW.id<>OLD.id OR NEW.identity_id<>OLD.identity_id OR NEW.activity_id<>OLD.activity_id OR NEW.enrolment_id<>OLD.enrolment_id
   OR NEW.activity_attempt_id IS DISTINCT FROM OLD.activity_attempt_id OR NEW.settings_snapshot IS DISTINCT FROM OLD.settings_snapshot OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_mixed_run_guard BEFORE UPDATE OR DELETE ON public.hub_mixed_runs FOR EACH ROW EXECUTE FUNCTION public.hub_guard_mixed_run();
CREATE FUNCTION public.hub_mixed_view(p_run_id UUID) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE r public.hub_mixed_runs%ROWTYPE;w public.hub_mixed_worlds%ROWTYPE;g public.sandbox_game_accounts%ROWTYPE;task JSONB;last_result BOOLEAN;
BEGIN
 SELECT * INTO r FROM public.hub_mixed_runs WHERE id=p_run_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_started');END IF;
 SELECT is_correct INTO last_result FROM public.hub_mixed_stage_evidence WHERE run_id=p_run_id ORDER BY sequence_number DESC,stage_number DESC LIMIT 1;
 IF r.status='in_progress' THEN
   SELECT * INTO w FROM public.hub_mixed_worlds WHERE run_id=p_run_id AND stage_cursor<2 ORDER BY sequence_number LIMIT 1;
   SELECT * INTO g FROM public.sandbox_game_accounts WHERE id=w.account_id;
   SELECT jsonb_build_object('action',public.hub_final_action(w.operation_type,w.stage_cursor),'game','Orion Stars','customerUsername',c.username,'identifier',g.game_username,
     'credit',coalesce(g.balance,0),'availableBalance',(SELECT balance FROM public.sandbox_game_wallets WHERE session_id=w.session_id AND game='Orion Stars'),'customerBalance',c.balance,
     'amount',o.amount,'operation',jsonb_build_object('id',o.id,'type',o.type,'status',o.status,'amount',o.amount,'requestedAt',o.created_at),'worldId',w.id,'operationNumber',w.sequence_number,'stage',w.stage_cursor+1) INTO task
   FROM public.sandbox_customers c JOIN public.sandbox_operations o ON o.id=w.pending_operation_id WHERE c.id=w.customer_id;
 END IF;
 RETURN jsonb_build_object('runId',r.id,'status',r.status,'result',r.result,'lastStageCorrect',last_result,'completedActions',(SELECT count(*) FROM public.hub_mixed_stage_evidence WHERE run_id=p_run_id),
   'totalActions',2*(SELECT count(*) FROM public.hub_mixed_worlds WHERE run_id=p_run_id),'task',task,'learningCompletionRecorded',r.status='completed' AND r.result AND r.activity_attempt_id IS NOT NULL);
END; $$;

CREATE FUNCTION public.hub_mixed_command(p_external_subject TEXT,p_activity_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;enrolment UUID;r public.hub_mixed_runs%ROWTYPE;w public.hub_mixed_worlds%ROWTYPE;claim public.hub_idempotency_keys%ROWTYPE;
 settings public.hub_assessment_settings%ROWTYPE;policy public.hub_account_policies%ROWTYPE;start_result JSONB;learning_attempt UUID;
 fingerprint TEXT;result JSONB;count_ops INTEGER;idx INTEGER;kind TEXT;operation public.sandbox_operations%ROWTYPE;session UUID;customer UUID;account UUID;outcome JSONB;context JSONB;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
 IF NOT EXISTS(SELECT 1 FROM public.hub_activities WHERE id=p_activity_id AND content->>'executionKind'='mixed_practice') THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED';END IF;
 SELECT e.id INTO enrolment FROM public.hub_enrolments e JOIN public.hub_modules m ON m.course_id=e.course_id JOIN public.hub_activities a ON a.module_id=m.id
 WHERE e.identity_id=actor AND e.status<>'withdrawn' AND a.id=p_activity_id FOR UPDATE OF e;
 IF enrolment IS NULL THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM public.hub_mixed_runs WHERE identity_id=actor AND activity_id=p_activity_id ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF p_command='read' THEN RETURN public.hub_mixed_view(r.id);END IF;
 IF p_command IS NULL OR p_command NOT IN ('start','action','history','abandon') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR length(coalesce(p_idempotency_key,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('activity',p_activity_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(actor,'mixed_practice',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=actor AND action_code='mixed_practice' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
 IF p_command='start' THEN
   IF r.status='in_progress' THEN result:=public.hub_mixed_view(r.id);
   ELSE
     IF NOT EXISTS(SELECT 1 FROM public.hub_module_progress p JOIN public.hub_activities a ON a.module_id=p.module_id WHERE p.enrolment_id=enrolment AND a.id=p_activity_id AND p.status='completed') THEN
       start_result:=public.hub_start_activity_attempt(p_external_subject,p_activity_id,'{}',p_idempotency_key);learning_attempt:=(start_result->>'activityAttemptId')::uuid;
     END IF;
     SELECT * INTO settings FROM public.hub_assessment_settings WHERE id='10000000-0000-4000-8000-000000000301';
     IF settings.minimum_operations<1 OR settings.maximum_operations>50 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
     SELECT p.* INTO policy FROM public.hub_account_policies p JOIN public.hub_activities a ON a.content->>'policyVersionId'=p.id::text WHERE a.content->>'executionKind'='account_id_lab' AND p.game='Orion Stars' ORDER BY p.version DESC LIMIT 1;
     IF policy.id IS NULL THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY';END IF;
     INSERT INTO public.hub_mixed_runs(identity_id,activity_id,enrolment_id,activity_attempt_id,settings_snapshot)
       VALUES(actor,p_activity_id,enrolment,learning_attempt,jsonb_build_object('workload',to_jsonb(settings)-'updated_by_identity_id','accountPolicyVersionId',policy.id)) RETURNING * INTO r;
     count_ops:=settings.minimum_operations+floor(random()*(settings.maximum_operations-settings.minimum_operations+1))::integer;
     FOR idx IN 1..count_ops LOOP
       account:=NULL;kind:=settings.operation_types[1+floor(random()*cardinality(settings.operation_types))::integer];
       IF settings.advanced_enabled AND random()<0.25 THEN kind:='RECONCILIATION';END IF;
       INSERT INTO public.trainee_sessions(trainee_name,status,runtime_mode) VALUES('Hub mixed practice','active','focused_practice') RETURNING id INTO session;
       INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(session,'AssessmentPlayer',500) RETURNING id INTO customer;
       INSERT INTO public.sandbox_game_wallets(session_id,game,balance) VALUES(session,'Orion Stars',20000);
       IF kind<>'CREATE ACCOUNT' THEN INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,password,balance) VALUES(session,customer,'Orion Stars','OS_Assess123','disposable-practice',100) RETURNING id INTO account;END IF;
       SELECT * INTO operation FROM public.create_reserved_sandbox_operation(jsonb_build_object('id',gen_random_uuid(),'session_id',session,'customer_id',customer,'game_account_id',account,'game','Orion Stars',
         'type',CASE kind WHEN 'RECONCILIATION' THEN 'ADD CREDITS' ELSE kind END,'amount',CASE kind WHEN 'ADD CREDITS' THEN 50 WHEN 'WITHDRAW CREDITS' THEN 25 WHEN 'RECONCILIATION' THEN 50 ELSE 0 END,'customer_balance_at_request',500,'game_balance_at_request',CASE WHEN account IS NULL THEN 0 ELSE 100 END,'created_at',clock_timestamp()));
       IF kind='RECONCILIATION' THEN PERFORM public.apply_sandbox_movement_scenario(operation.id,'PENDING_RECONCILIATION',random()<0.5);END IF;
       INSERT INTO public.hub_mixed_worlds(run_id,sequence_number,operation_type,session_id,customer_id,account_id,account_policy_id,pending_operation_id) VALUES(r.id,idx,kind,session,customer,account,policy.id,operation.id);
     END LOOP;
   END IF;
 ELSE
   IF r.status<>'in_progress' OR r.id::text IS DISTINCT FROM p_input->>'runId' THEN RAISE EXCEPTION 'HUB_PRACTICE_CONFLICT';END IF;
   IF p_command='abandon' THEN
     UPDATE public.hub_mixed_runs SET status='abandoned',result=FALSE,completed_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   ELSE
     SELECT * INTO w FROM public.hub_mixed_worlds WHERE run_id=r.id AND stage_cursor<2 ORDER BY sequence_number LIMIT 1 FOR UPDATE;
     IF w.id::text IS DISTINCT FROM p_input->>'worldId' OR (w.stage_cursor+1)::text IS DISTINCT FROM p_input->>'stage' THEN RAISE EXCEPTION 'HUB_PRACTICE_CONFLICT';END IF;
     IF p_command='history' THEN
       UPDATE public.hub_mixed_worlds SET history_read_at=clock_timestamp() WHERE id=w.id;
       SELECT jsonb_build_object('history',coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'amount',amount,'createdAt',created_at) ORDER BY created_at,id),'[]')) INTO result FROM public.sandbox_game_history WHERE session_id=w.session_id AND game_account_id=w.account_id;
     ELSE
       context:=to_jsonb(w)||jsonb_build_object('attempt_id',NULL);
       outcome:=public.hub_execute_training_action(actor,context,public.hub_final_action(w.operation_type,w.stage_cursor),p_input,FALSE);
       INSERT INTO public.hub_mixed_stage_evidence(run_id,world_id,sequence_number,stage_number,action_code,is_correct,evidence)
         VALUES(r.id,w.id,w.sequence_number,w.stage_cursor+1,public.hub_final_action(w.operation_type,w.stage_cursor),(outcome->>'isCorrect')::boolean,outcome->'evidence');
       UPDATE public.hub_mixed_worlds SET stage_cursor=stage_cursor+1,stages_correct=stages_correct AND (outcome->>'isCorrect')::boolean WHERE id=w.id;
       IF NOT EXISTS(SELECT 1 FROM public.hub_mixed_worlds WHERE run_id=r.id AND stage_cursor<2) THEN
         UPDATE public.hub_mixed_runs SET status='completed',result=NOT EXISTS(SELECT 1 FROM public.hub_mixed_worlds WHERE run_id=r.id AND NOT stages_correct),completed_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
         IF r.result AND r.activity_attempt_id IS NOT NULL THEN PERFORM public.hub_complete_activity_attempt(p_external_subject,r.activity_attempt_id,jsonb_build_object('practiceRunId',r.id,'serverVerified',TRUE),p_idempotency_key);END IF;
       END IF;
     END IF;
   END IF;
   IF r.status<>'in_progress' THEN UPDATE public.trainee_sessions SET status='completed',ended_at=clock_timestamp() WHERE id IN(SELECT session_id FROM public.hub_mixed_worlds WHERE run_id=r.id);END IF;
 END IF;
 IF result IS NULL THEN result:=public.hub_mixed_view(r.id);END IF;
 UPDATE public.hub_idempotency_keys SET response=result WHERE identity_id=actor AND action_code='mixed_practice' AND idempotency_key=p_idempotency_key;
 RETURN result;
END; $$;

CREATE FUNCTION public.hub_guard_mixed_completion() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status<>'completed' AND EXISTS(SELECT 1 FROM public.hub_activities WHERE id=NEW.activity_id AND content->>'executionKind'='mixed_practice')
   AND NOT EXISTS(SELECT 1 FROM public.hub_mixed_runs WHERE activity_attempt_id=NEW.id AND status='completed' AND result) THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_mixed_completion_guard BEFORE UPDATE ON public.hub_activity_attempts FOR EACH ROW EXECUTE FUNCTION public.hub_guard_mixed_completion();
CREATE FUNCTION public.hub_initialize_mixed_practice() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.hub_activities SET content=(content-'blockedReason')||'{"policyStatus":"approved","executionKind":"mixed_practice"}'::jsonb WHERE stable_code='mixed-operation-policy-gated-practice';
END; $$;
SELECT public.hub_initialize_mixed_practice();
ALTER TABLE public.hub_mixed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_mixed_worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_mixed_stage_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_mixed_runs,public.hub_mixed_worlds,public.hub_mixed_stage_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_mixed_runs,public.hub_mixed_worlds,public.hub_mixed_stage_evidence TO service_role;
REVOKE ALL ON FUNCTION public.hub_guard_mixed_run(),public.hub_guard_mixed_completion(),public.hub_mixed_view(UUID),public.hub_initialize_mixed_practice(),public.hub_mixed_command(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hub_guard_mixed_run(),public.hub_guard_mixed_completion(),public.hub_mixed_view(UUID),public.hub_initialize_mixed_practice() FROM service_role;
GRANT EXECUTE ON FUNCTION public.hub_mixed_command(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
