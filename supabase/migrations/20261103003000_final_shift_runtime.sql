-- Shared native action adapter. Only the owned assessment command may call it.
CREATE FUNCTION public.hub_execute_training_action(p_actor UUID,p_context JSONB,p_action TEXT,p_input JSONB,p_is_assessment BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID:=p_actor;v_world public.hub_evaluation_worlds%ROWTYPE;v_action TEXT:=p_action;
 v_account public.sandbox_game_accounts%ROWTYPE;v_policy public.hub_account_policies%ROWTYPE;v_operation public.sandbox_operations%ROWTYPE;
 v_identifier TEXT;v_password TEXT;v_username TEXT;v_pattern TEXT;v_account_id UUID;v_amount NUMERIC;v_correct BOOLEAN:=FALSE;
 v_history JSONB;v_history_ids JSONB;v_results JSONB;v_decision TEXT;v_before NUMERIC;v_after NUMERIC;v_evidence JSONB;
BEGIN
 v_world:=jsonb_populate_record(NULL::public.hub_evaluation_worlds,p_context);
 SELECT * INTO v_account FROM public.sandbox_game_accounts WHERE id=v_world.account_id;
 SELECT username INTO v_username FROM public.sandbox_customers WHERE id=v_world.customer_id;
 v_before:=coalesce(v_account.balance,0);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id) ORDER BY id),'[]') INTO v_history FROM (
   SELECT h.id FROM public.sandbox_game_history h WHERE h.game_account_id=v_world.account_id
     AND h.created_at>=now()-make_interval(days=>coalesce((SELECT (settings_snapshot->>'historyReviewDays')::integer FROM public.hub_scored_evaluation_attempts WHERE id=v_world.attempt_id),7))
   ORDER BY h.created_at DESC,h.id DESC LIMIT (SELECT (settings_snapshot->>'historyRecordLimit')::integer FROM public.hub_scored_evaluation_attempts WHERE id=v_world.attempt_id)
 ) history;
      v_identifier:=btrim(coalesce(p_input->>'identifier',''));v_password:=btrim(coalesce(p_input->>'password',''));
      IF coalesce(p_input->>'actionCode','')=v_action THEN
        IF v_action='CREATE_ACCOUNT' THEN
          SELECT * INTO v_policy FROM public.hub_account_policies WHERE id=v_world.account_policy_id;
          v_pattern:=replace(v_policy.validation_template,'{customer6}',left(regexp_replace(v_username,'[^a-zA-Z0-9]','','g'),6));
          v_pattern:=replace(v_pattern,'{customer}',left(regexp_replace(v_username,'[^a-zA-Z0-9]','','g'),coalesce((v_policy.policy#>>'{segments,1,maxLength}')::integer,6)));
          v_correct:=v_identifier~*v_pattern AND length(v_password) BETWEEN 1 AND 200;
          IF length(v_identifier) BETWEEN 1 AND 200 AND length(v_password) BETWEEN 1 AND 200 AND v_world.account_id IS NULL THEN
            INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,nickname,password,balance,created_at)
              VALUES(v_world.session_id,v_world.customer_id,'Orion Stars',v_identifier,v_identifier,v_password,0,clock_timestamp()) RETURNING id INTO v_account_id;
            INSERT INTO public.sandbox_game_history(session_id,customer_id,game_account_id,type,description) VALUES(v_world.session_id,v_world.customer_id,v_account_id,'GAME CREATE ACCOUNT','Orion evaluation account creation');
            IF p_is_assessment THEN UPDATE public.hub_evaluation_worlds SET account_id=v_account_id WHERE id=v_world.id; ELSE UPDATE public.hub_mixed_worlds SET account_id=v_account_id WHERE id=v_world.id;END IF;
          ELSE v_correct:=FALSE; END IF;
        ELSIF v_action='CUSTOMER_RESPONSE' THEN
          SELECT * INTO v_operation FROM public.sandbox_operations WHERE id=v_world.pending_operation_id;
          v_correct:=v_operation.status IN ('APPROVED','CANCELLED') AND p_input->>'responseCode'='recorded-outcome'
            AND p_input->>'reference'=v_operation.id::text AND coalesce(p_input->>'credit','')~'^[0-9]+([.][0-9]+)?$';
          IF v_correct THEN v_correct:=(p_input->>'credit')::numeric=(SELECT balance FROM public.sandbox_customers WHERE id=v_world.customer_id);END IF;
        ELSIF v_action LIKE 'BACKEND_%' OR v_action='RESOLVE_RECONCILIATION' THEN
          SELECT * INTO v_operation FROM public.sandbox_operations WHERE id=v_world.pending_operation_id FOR UPDATE;
          v_decision:=coalesce(p_input->>'decision','');
          IF v_operation.id IS NULL OR v_operation.status<>'PENDING' OR v_decision NOT IN ('APPROVED','CANCELLED') THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
          IF v_action IN ('BACKEND_ADD_CREDITS','BACKEND_WITHDRAW_CREDITS','RESOLVE_RECONCILIATION') THEN
            IF v_action='RESOLVE_RECONCILIATION' AND v_world.history_read_at IS NULL THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
            v_results:=public.settle_backend_movement_operation(v_operation.id,v_decision,v_actor::text,nullif(btrim(p_input->>'reason'),''));
            v_correct:=coalesce((v_results->>'isCorrect')::boolean,FALSE);
          ELSE
            v_correct:=v_decision='APPROVED' AND v_account.id IS NOT NULL AND v_identifier=v_account.game_username AND p_input->>'kiosk'='OrionStars';
            IF v_action IN ('BACKEND_CREATE_ACCOUNT','BACKEND_RESET_PASSWORD') THEN
              v_correct:=v_correct AND length(v_password)>0 AND v_password=v_account.password;
              IF v_action='BACKEND_CREATE_ACCOUNT' THEN v_correct:=v_correct AND v_account.created_at>=v_operation.created_at; END IF;
            ELSE
              v_correct:=v_correct AND coalesce(p_input->>'credit','')~'^[0-9]+([.][0-9]+)?$';
              IF v_correct THEN v_correct:=(p_input->>'credit')::numeric=v_account.balance; END IF;
            END IF;
            UPDATE public.sandbox_operations SET status=v_decision,processed_at=clock_timestamp(),processed_by=v_actor::text,is_correct=coalesce(v_correct,FALSE),game_account_id=v_account.id,
              request_data=jsonb_build_object('gameId',v_identifier,'kiosk',p_input->>'kiosk','passwordProvided',length(v_password)>0,'amount',p_input->>'credit') WHERE id=v_operation.id;
          END IF;
        ELSIF v_action='SEARCH_USER' THEN
          v_correct:=v_account.id IS NOT NULL AND v_identifier=v_account.game_username;
        ELSIF v_action='VERIFY_BALANCE' THEN
          v_correct:=v_account.id IS NOT NULL AND v_identifier=v_account.game_username AND coalesce(p_input->>'credit','')~'^[0-9]+([.][0-9]+)?$';
          IF v_correct THEN v_correct:=(p_input->>'credit')::numeric=v_account.balance; END IF;
        ELSIF v_action IN ('ADD_CREDITS','WITHDRAW_CREDITS') THEN
          IF v_account.id IS NOT NULL AND v_identifier=v_account.game_username AND coalesce(p_input->>'amount','')~'^[0-9]+([.][0-9]+)?$' THEN
            v_amount:=(p_input->>'amount')::numeric;
            IF v_amount>0 AND v_amount<=(CASE WHEN v_action='ADD_CREDITS' THEN (SELECT balance FROM public.sandbox_game_wallets WHERE session_id=v_world.session_id AND game='Orion Stars') ELSE v_account.balance END) THEN
              IF v_action='ADD_CREDITS' THEN PERFORM public.recharge_sandbox_game_account(v_account.id,v_amount,'Formal evaluation game credit'); ELSE PERFORM public.redeem_sandbox_game_account(v_account.id,v_amount,'Formal evaluation game withdrawal'); END IF;
              v_correct:=v_amount=(CASE WHEN v_action='ADD_CREDITS' THEN 50 ELSE 25 END);
            END IF;
          END IF;
        ELSIF v_action='REVIEW_TRANSACTION_RECORDS' THEN
          SELECT coalesce(jsonb_agg(item->'id' ORDER BY item->>'id'),'[]') INTO v_history_ids FROM jsonb_array_elements(v_history) item;
          IF jsonb_typeof(p_input->'historyIds')='array' THEN
            SELECT coalesce(jsonb_agg(item ORDER BY item#>>'{}'),'[]') INTO v_results FROM jsonb_array_elements(p_input->'historyIds') item;
            v_correct:=v_world.history_read_at IS NOT NULL AND v_identifier=v_account.game_username AND v_results=v_history_ids;
          END IF;
        ELSIF v_action='RESET_PASSWORD_EDIT_INFORMATION' THEN
          IF v_account.id IS NOT NULL AND v_identifier=v_account.game_username AND length(v_password) BETWEEN 1 AND 200 THEN
            UPDATE public.sandbox_game_accounts SET password=v_password WHERE id=v_account.id;
            INSERT INTO public.sandbox_game_history(session_id,customer_id,game_account_id,type,description) VALUES(v_world.session_id,v_world.customer_id,v_account.id,'GAME RESET PASSWORD','Formal evaluation reset');
            v_correct:=TRUE;
          END IF;
        END IF;
      END IF;
      SELECT balance INTO v_after FROM public.sandbox_game_accounts WHERE id=CASE WHEN p_is_assessment THEN (SELECT account_id FROM public.hub_evaluation_worlds WHERE id=v_world.id) ELSE (SELECT account_id FROM public.hub_mixed_worlds WHERE id=v_world.id) END;
      v_evidence:=jsonb_build_object('adapterVersion','orion-native-v1','policyVersionId',v_world.account_policy_id,
        'attemptedAction',p_input->>'actionCode','identifier',v_identifier,'amount',v_amount,'passwordProvided',length(v_password)>0,
        'operationId',v_world.pending_operation_id,'decision',p_input->>'decision','reason',p_input->>'reason','responseCode',p_input->>'responseCode','reference',p_input->>'reference','submittedCredit',p_input->>'credit',
        'creditBefore',v_before,'creditAfter',v_after,'historyReadAt',v_world.history_read_at);

 RETURN jsonb_build_object('isCorrect',coalesce(v_correct,FALSE),'evidence',v_evidence);
END; $$;
REVOKE ALL ON FUNCTION public.hub_execute_training_action(UUID,JSONB,TEXT,JSONB,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;


CREATE FUNCTION public.hub_execute_evaluation_action(p_actor UUID,p_world_id UUID,p_action TEXT,p_input JSONB) RETURNS JSONB
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE context public.hub_evaluation_worlds%ROWTYPE;
BEGIN
 SELECT * INTO context FROM public.hub_evaluation_worlds WHERE id=p_world_id FOR UPDATE;
 RETURN public.hub_execute_training_action(p_actor,to_jsonb(context),p_action,p_input,TRUE);
END; $$;
REVOKE ALL ON FUNCTION public.hub_execute_evaluation_action(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.hub_final_operation_plan (
  attempt_id UUID NOT NULL REFERENCES public.hub_evaluation_runtime(attempt_id),sequence_number INTEGER NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('CREATE ACCOUNT','REFRESH BALANCE','ADD CREDITS','WITHDRAW CREDITS','RESET PASSWORD','RECONCILIATION')),
  world_id UUID NOT NULL UNIQUE REFERENCES public.hub_evaluation_worlds(id),
  stage_cursor INTEGER NOT NULL DEFAULT 0 CHECK(stage_cursor BETWEEN 0 AND 2),stages_correct BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY(attempt_id,sequence_number)
);
CREATE TABLE public.hub_final_stage_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id UUID NOT NULL,sequence_number INTEGER NOT NULL,stage_number INTEGER NOT NULL,
  action_code TEXT NOT NULL,is_correct BOOLEAN NOT NULL,evidence JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 years',UNIQUE(attempt_id,sequence_number,stage_number),
  FOREIGN KEY(attempt_id,sequence_number) REFERENCES public.hub_final_operation_plan(attempt_id,sequence_number)
);
CREATE TRIGGER hub_final_stage_evidence_immutable BEFORE UPDATE OR DELETE ON public.hub_final_stage_evidence FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE FUNCTION public.hub_guard_final_plan() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
  IF NEW.attempt_id<>OLD.attempt_id OR NEW.sequence_number<>OLD.sequence_number OR NEW.operation_type<>OLD.operation_type OR NEW.world_id<>OLD.world_id
    OR NEW.stage_cursor<OLD.stage_cursor OR NEW.stage_cursor>OLD.stage_cursor+1 OR NOT OLD.stages_correct AND NEW.stages_correct THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_final_plan_guard BEFORE UPDATE OR DELETE ON public.hub_final_operation_plan FOR EACH ROW EXECUTE FUNCTION public.hub_guard_final_plan();

CREATE FUNCTION public.hub_final_action(p_type TEXT,p_stage INTEGER) RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p_stage=0 THEN CASE p_type WHEN 'CREATE ACCOUNT' THEN 'CREATE_ACCOUNT' WHEN 'REFRESH BALANCE' THEN 'VERIFY_BALANCE' WHEN 'ADD CREDITS' THEN 'ADD_CREDITS' WHEN 'WITHDRAW CREDITS' THEN 'WITHDRAW_CREDITS' WHEN 'RESET PASSWORD' THEN 'RESET_PASSWORD_EDIT_INFORMATION' ELSE 'RESOLVE_RECONCILIATION' END
 ELSE CASE p_type WHEN 'CREATE ACCOUNT' THEN 'BACKEND_CREATE_ACCOUNT' WHEN 'REFRESH BALANCE' THEN 'BACKEND_REFRESH_BALANCE' WHEN 'ADD CREDITS' THEN 'BACKEND_ADD_CREDITS' WHEN 'WITHDRAW CREDITS' THEN 'BACKEND_WITHDRAW_CREDITS' WHEN 'RESET PASSWORD' THEN 'BACKEND_RESET_PASSWORD' ELSE 'CUSTOMER_RESPONSE' END END;
$$;
CREATE FUNCTION public.hub_final_runtime_view(p_attempt_id UUID) RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE a public.hub_scored_evaluation_attempts%ROWTYPE;r public.hub_evaluation_runtime%ROWTYPE;p public.hub_final_operation_plan%ROWTYPE;
  w public.hub_evaluation_worlds%ROWTYPE;g public.sandbox_game_accounts%ROWTYPE;questions JSONB;task JSONB;
BEGIN
  SELECT * INTO a FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id;
  IF a.status<>'in_progress' THEN RETURN jsonb_build_object('attemptId',a.id,'status',a.status,'score',a.score,'result',a.result_status);END IF;
  SELECT * INTO r FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_RUNTIME_NOT_STARTED';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',q->>'code','question',q->>'question','choices',q->'choices')),'[]') INTO questions FROM jsonb_array_elements(r.theory_snapshot) q;
  SELECT * INTO p FROM public.hub_final_operation_plan WHERE attempt_id=p_attempt_id AND stage_cursor<2 ORDER BY sequence_number LIMIT 1;
  IF FOUND THEN
    SELECT * INTO w FROM public.hub_evaluation_worlds WHERE id=p.world_id;
    SELECT * INTO g FROM public.sandbox_game_accounts WHERE id=w.account_id;
    SELECT jsonb_build_object('action',public.hub_final_action(p.operation_type,p.stage_cursor),'game','Orion Stars','gameFamily','orion-stars',
      'customerUsername',c.username,'identifier',g.game_username,'credit',coalesce(g.balance,0),'availableBalance',(SELECT balance FROM public.sandbox_game_wallets WHERE session_id=w.session_id AND game='Orion Stars'),
      'customerBalance',c.balance,'operation',jsonb_build_object('id',o.id,'type',o.type,'status',o.status,'amount',o.amount,'requestedAt',o.created_at),
      'amount',o.amount,'operationNumber',p.sequence_number,'stage',p.stage_cursor+1) INTO task
      FROM public.sandbox_customers c JOIN public.sandbox_operations o ON o.id=w.pending_operation_id WHERE c.id=w.customer_id;
  END IF;
  RETURN jsonb_build_object('attemptId',a.id,'status',a.status,'expiresAt',a.expires_at,'questions',questions,'theorySubmitted',r.theory_answers<>'{}'::jsonb,
    'completedActions',(SELECT count(*) FROM public.hub_final_stage_evidence WHERE attempt_id=p_attempt_id),'totalActions',2*(SELECT count(*) FROM public.hub_final_operation_plan WHERE attempt_id=p_attempt_id),'task',task);
END; $$;

CREATE FUNCTION public.hub_final_runtime_command(p_actor UUID,p_attempt_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.hub_scored_evaluation_attempts%ROWTYPE;r public.hub_evaluation_runtime%ROWTYPE;claim public.hub_idempotency_keys%ROWTYPE;
  p public.hub_final_operation_plan%ROWTYPE;w public.hub_evaluation_worlds%ROWTYPE;policy public.hub_account_policies%ROWTYPE;
  fingerprint TEXT;result JSONB;questions JSONB:='[]';question JSONB;code TEXT;kind TEXT;idx INTEGER:=0;
  session UUID;customer UUID;account UUID;world UUID;operation public.sandbox_operations%ROWTYPE;action TEXT;outcome JSONB;results JSONB;
BEGIN
  SELECT * INTO a FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id AND identity_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
  IF p_command='read' THEN RETURN public.hub_final_runtime_view(p_attempt_id);END IF;
  IF p_command NOT IN ('start','theory','action','history') OR p_command IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR length(coalesce(p_idempotency_key,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  fingerprint:=encode(extensions.digest(jsonb_build_object('attempt',p_attempt_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
  INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(p_actor,'final_runtime',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
  SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=p_actor AND action_code='final_runtime' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
  IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
  IF a.status<>'in_progress' THEN RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';END IF;
  IF a.expires_at<=now() THEN RAISE EXCEPTION 'ATTEMPT_EXPIRED';END IF;
  SELECT * INTO r FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_command<>'start' THEN RAISE EXCEPTION 'HUB_RUNTIME_NOT_STARTED';END IF;
    FOR code IN SELECT jsonb_array_elements_text(a.settings_snapshot->'theoryItemCodes') LOOP
      SELECT jsonb_build_object('id',id,'code',stable_code,'version',version,'question',q.question,'choices',choices,'correctOption',correct_option) INTO question
        FROM public.hub_theory_question_versions q WHERE stable_code=code AND published AND a.settings_snapshot->'theoryQuestionVersionIds' ? id::text ORDER BY version DESC LIMIT 1;
      IF question IS NULL THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED';END IF;
      questions:=questions||jsonb_build_array(question);
    END LOOP;
    IF jsonb_array_length(questions)=0 THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED';END IF;
    INSERT INTO public.hub_evaluation_runtime(attempt_id,theory_snapshot) VALUES(p_attempt_id,questions) RETURNING * INTO r;
    SELECT * INTO policy FROM public.hub_account_policies WHERE id::text=a.settings_snapshot->>'accountPolicyVersionId';
    IF NOT FOUND THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY';END IF;
    FOR kind IN SELECT jsonb_array_elements_text(a.settings_snapshot#>'{fullShift,operations}') LOOP
      idx:=idx+1;account:=NULL;
      INSERT INTO public.trainee_sessions(trainee_name,status,runtime_mode) VALUES('Hub final assessment','assessment','focused_practice') RETURNING id INTO session;
      INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(session,'AssessmentPlayer',500) RETURNING id INTO customer;
      INSERT INTO public.sandbox_game_wallets(session_id,game,balance) VALUES(session,'Orion Stars',20000);
      IF kind<>'CREATE ACCOUNT' THEN INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,nickname,password,balance) VALUES(session,customer,'Orion Stars','OS_Assess123','OS_Assess123','disposable-assessment',100) RETURNING id INTO account;END IF;
      SELECT * INTO operation FROM public.create_reserved_sandbox_operation(jsonb_build_object('id',gen_random_uuid(),'session_id',session,'customer_id',customer,'game_account_id',account,'game','Orion Stars',
        'type',CASE kind WHEN 'RECONCILIATION' THEN 'ADD CREDITS' ELSE kind END,'amount',CASE kind WHEN 'ADD CREDITS' THEN 50 WHEN 'WITHDRAW CREDITS' THEN 25 WHEN 'RECONCILIATION' THEN 50 ELSE 0 END,'customer_balance_at_request',500,'game_balance_at_request',CASE WHEN account IS NULL THEN 0 ELSE 100 END,'created_at',clock_timestamp()));
      IF kind='RECONCILIATION' THEN PERFORM public.apply_sandbox_movement_scenario(operation.id,'PENDING_RECONCILIATION',random()<0.5);END IF;
      INSERT INTO public.hub_evaluation_worlds(attempt_id,game_family_key,session_id,customer_id,account_id,account_policy_id,pending_operation_id)
        VALUES(p_attempt_id,'orion-stars:'||idx,session,customer,account,policy.id,operation.id) RETURNING id INTO world;
      INSERT INTO public.hub_final_operation_plan(attempt_id,sequence_number,operation_type,world_id) VALUES(p_attempt_id,idx,kind,world);
    END LOOP;
  END IF;
  IF p_command='theory' THEN
    IF r.theory_answers<>'{}'::jsonb THEN RAISE EXCEPTION 'HUB_THEORY_ALREADY_SUBMITTED';END IF;
    IF jsonb_typeof(p_input->'answers') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
    FOR question IN SELECT value FROM jsonb_array_elements(r.theory_snapshot) LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(question->'choices') choice WHERE choice->>'id'=p_input->'answers'->>(question->>'code')) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_object_keys(p_input->'answers'))<>jsonb_array_length(r.theory_snapshot) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
    UPDATE public.hub_evaluation_runtime SET theory_answers=p_input->'answers' WHERE attempt_id=p_attempt_id RETURNING * INTO r;
  ELSIF p_command IN ('action','history') THEN
    SELECT * INTO p FROM public.hub_final_operation_plan WHERE attempt_id=p_attempt_id AND stage_cursor<2 ORDER BY sequence_number LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'HUB_RUNTIME_ACTIONS_COMPLETE';END IF;
    SELECT * INTO w FROM public.hub_evaluation_worlds WHERE id=p.world_id FOR UPDATE;
    IF p_command='history' THEN
      UPDATE public.hub_evaluation_worlds SET history_read_at=clock_timestamp() WHERE id=w.id;
      SELECT jsonb_build_object('history',coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'amount',amount,'createdAt',created_at) ORDER BY created_at,id),'[]')) INTO result
        FROM public.sandbox_game_history WHERE session_id=w.session_id AND game_account_id=w.account_id;
    ELSE
      action:=public.hub_final_action(p.operation_type,p.stage_cursor);
      outcome:=public.hub_execute_evaluation_action(p_actor,w.id,action,p_input);
      INSERT INTO public.hub_final_stage_evidence(attempt_id,sequence_number,stage_number,action_code,is_correct,evidence)
        VALUES(p_attempt_id,p.sequence_number,p.stage_cursor+1,action,(outcome->>'isCorrect')::boolean,outcome->'evidence');
      UPDATE public.hub_final_operation_plan SET stage_cursor=stage_cursor+1,stages_correct=stages_correct AND (outcome->>'isCorrect')::boolean WHERE attempt_id=p_attempt_id AND sequence_number=p.sequence_number RETURNING * INTO p;
      IF p.stage_cursor=2 THEN
        INSERT INTO public.hub_evaluation_action_evidence(attempt_id,sequence_number,item_code,game_family_key,is_correct,evidence)
        VALUES(p_attempt_id,p.sequence_number,'FULL_SHIFT_OPERATION_'||p.sequence_number,'orion-stars',p.stages_correct,jsonb_build_object('adapterVersion','orion-final-v1','operationId',w.pending_operation_id,'operationType',p.operation_type,'worldId',w.id));
        UPDATE public.hub_evaluation_runtime SET action_cursor=action_cursor+1 WHERE attempt_id=p_attempt_id RETURNING * INTO r;
      END IF;
    END IF;
  END IF;
  IF r.theory_answers<>'{}'::jsonb AND NOT EXISTS(SELECT 1 FROM public.hub_final_operation_plan WHERE attempt_id=p_attempt_id AND stage_cursor<2) THEN
    SELECT jsonb_agg(item) INTO results FROM(
      SELECT jsonb_build_object('section','theory','item_code',q->>'code','is_correct',r.theory_answers->>(q->>'code')=q->>'correctOption','failure_points','[]'::jsonb) item FROM jsonb_array_elements(r.theory_snapshot) q
      UNION ALL SELECT jsonb_build_object('section','practical','item_code',e.item_code,'game_family_key',e.game_family_key,'sequence_number',e.sequence_number,'is_correct',e.is_correct,'failure_points',CASE WHEN e.is_correct THEN '[]'::jsonb ELSE '["Required operation evidence did not match"]'::jsonb END) FROM public.hub_evaluation_action_evidence e WHERE e.attempt_id=p_attempt_id
    ) scored;
    PERFORM public.hub_score_scored_evaluation_attempt(p_attempt_id,results);
    UPDATE public.trainee_sessions SET status='completed',ended_at=clock_timestamp() WHERE id IN(SELECT session_id FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id);
  END IF;
  IF result IS NULL THEN result:=public.hub_final_runtime_view(p_attempt_id);END IF;
  UPDATE public.hub_idempotency_keys SET response=result WHERE identity_id=p_actor AND action_code='final_runtime' AND idempotency_key=p_idempotency_key;
  RETURN result;
END; $$;
ALTER TABLE public.hub_final_operation_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_final_stage_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_final_operation_plan,public.hub_final_stage_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_final_operation_plan,public.hub_final_stage_evidence TO service_role;
REVOKE ALL ON FUNCTION public.hub_guard_final_plan(),public.hub_final_action(TEXT,INTEGER),public.hub_final_runtime_view(UUID),public.hub_final_runtime_command(UUID,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hub_initialize_final_policy() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.hub_scored_evaluations SET required_action_codes=ARRAY['FULL_SHIFT_OPERATION'],practical_item_weights='{"FULL_SHIFT_OPERATION":80}'
 WHERE stable_code='final-pretraining-readiness' AND publication_status='draft' AND cardinality(required_action_codes)=0;
END; $$;
SELECT public.hub_initialize_final_policy();
REVOKE ALL ON FUNCTION public.hub_initialize_final_policy() FROM PUBLIC,anon,authenticated,service_role;
