-- Dispose detailed governed-evaluation packets, never result/budget/progress rows.
CREATE TABLE public.hub_formal_retention_cases(
 attempt_id UUID PRIMARY KEY REFERENCES public.hub_scored_evaluation_attempts(id),revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'none' CHECK(state IN('none','pending','executing','cancelled','disposed')),
 held BOOLEAN NOT NULL DEFAULT FALSE,hold_reason TEXT,held_by UUID REFERENCES public.hub_identities(id),
 requested_by UUID REFERENCES public.hub_identities(id),request_reason TEXT,fingerprint TEXT,
 reviewed_by UUID REFERENCES public.hub_identities(id),review_reason TEXT,disposed_at TIMESTAMPTZ,
 removed_counts JSONB,session_ids UUID[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.hub_formal_retention_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id UUID NOT NULL REFERENCES public.hub_scored_evaluation_attempts(id),
 actor_id UUID NOT NULL REFERENCES public.hub_identities(id),action TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),revision INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER hub_formal_retention_events_immutable BEFORE UPDATE OR DELETE ON public.hub_formal_retention_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE TABLE public.hub_formal_retry_lineage(
 identity_id UUID NOT NULL,action_code TEXT NOT NULL,idempotency_key TEXT NOT NULL,
 attempt_id UUID NOT NULL REFERENCES public.hub_scored_evaluation_attempts(id),
 PRIMARY KEY(identity_id,action_code,idempotency_key),
 FOREIGN KEY(identity_id,action_code,idempotency_key) REFERENCES public.hub_idempotency_keys(identity_id,action_code,idempotency_key) ON DELETE CASCADE
);
CREATE INDEX hub_formal_retry_attempt_idx ON public.hub_formal_retry_lineage(attempt_id);
-- Attribute old replies only when their actual identifiers prove ownership.
CREATE FUNCTION public.hub_backfill_formal_retry_lineage() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
INSERT INTO public.hub_formal_retry_lineage
SELECT k.identity_id,k.action_code,k.idempotency_key,a.id FROM public.hub_idempotency_keys k
JOIN public.hub_scored_evaluation_attempts a ON a.id::text=k.response->>'attemptId' AND a.identity_id=k.identity_id
WHERE k.action_code IN('evaluation_runtime','final_runtime') ON CONFLICT DO NOTHING;
INSERT INTO public.hub_formal_retry_lineage
SELECT DISTINCT k.identity_id,k.action_code,k.idempotency_key,w.attempt_id
FROM public.hub_idempotency_keys k JOIN public.hub_evaluation_worlds w ON EXISTS(
 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(k.response->'history')='array' THEN k.response->'history' ELSE '[]' END)h
 JOIN public.sandbox_game_history g ON g.id::text=h->>'id' WHERE g.session_id=w.session_id)
JOIN public.hub_scored_evaluation_attempts a ON a.id=w.attempt_id AND a.identity_id=k.identity_id
WHERE k.action_code IN('evaluation_runtime','final_runtime') AND NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(k.response->'history')='array' THEN k.response->'history' ELSE '[]' END)h WHERE NOT EXISTS(SELECT 1 FROM public.sandbox_game_history g WHERE g.session_id=w.session_id AND g.id::text=h->>'id'))
ON CONFLICT DO NOTHING;
END; $$;
SELECT public.hub_backfill_formal_retry_lineage();
REVOKE ALL ON FUNCTION public.hub_backfill_formal_retry_lineage() FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.hub_evaluation_runtime_command(TEXT,UUID,TEXT,JSONB,TEXT) RENAME TO hub_evaluation_runtime_command_original;
REVOKE ALL ON FUNCTION public.hub_evaluation_runtime_command_original(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hub_evaluation_runtime_command(p_external_subject TEXT,p_attempt_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;result JSONB;code TEXT;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
 PERFORM pg_advisory_xact_lock(hashtextextended('hub-formal-retention:'||p_attempt_id,0));
 IF NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id AND identity_id=actor) THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 IF EXISTS(SELECT 1 FROM public.hub_formal_retention_cases WHERE attempt_id=p_attempt_id AND state='disposed') THEN RAISE EXCEPTION 'HUB_FORMAL_EVIDENCE_DISPOSED';END IF;
 result:=public.hub_evaluation_runtime_command_original(p_external_subject,p_attempt_id,p_command,p_input,p_idempotency_key);
 IF p_command<>'read' THEN
   SELECT CASE WHEN jsonb_typeof(settings_snapshot->'fullShift')='object' THEN 'final_runtime' ELSE 'evaluation_runtime' END INTO code FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id;
   INSERT INTO public.hub_formal_retry_lineage VALUES(actor,code,p_idempotency_key,p_attempt_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN result;
END; $$;

CREATE FUNCTION public.hub_formal_retention_state(p_attempt_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.hub_scored_evaluation_attempts%ROWTYPE;c public.hub_formal_retention_cases%ROWTYPE;
 sessions UUID[];due TIMESTAMPTZ;counts JSONB;blocked TEXT[]:='{}';fingerprint TEXT;
BEGIN
 SELECT * INTO a FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 SELECT * INTO c FROM public.hub_formal_retention_cases WHERE attempt_id=a.id;
 SELECT coalesce(array_agg(session_id ORDER BY session_id),'{}') INTO sessions FROM public.hub_evaluation_worlds WHERE attempt_id=a.id;
 SELECT greatest(a.completed_at+interval '2 years',a.submitted_at+interval '2 years',
  (SELECT max(greatest(created_at+interval '2 years',retention_until)) FROM public.hub_evaluation_action_evidence WHERE attempt_id=a.id),
  (SELECT max(greatest(created_at+interval '2 years',retention_until)) FROM public.hub_final_stage_evidence WHERE attempt_id=a.id),
  (SELECT max(created_at)+interval '2 years' FROM public.hub_scored_evaluation_item_results WHERE attempt_id=a.id),
  (SELECT max(created_at)+interval '2 years' FROM public.hub_evaluation_runtime WHERE attempt_id=a.id),
  (SELECT max(greatest(captured_at+interval '2 years',retention_until)) FROM public.hub_operation_evidence WHERE session_id=ANY(sessions)),
  (SELECT max(k.created_at)+interval '2 years' FROM public.hub_idempotency_keys k JOIN public.hub_formal_retry_lineage l USING(identity_id,action_code,idempotency_key) WHERE l.attempt_id=a.id),
  (SELECT max(created_at)+interval '2 years' FROM public.sandbox_game_history WHERE session_id=ANY(sessions)),
  (SELECT max(coalesce(processed_at,created_at))+interval '2 years' FROM public.sandbox_operations WHERE session_id=ANY(sessions)),
  (SELECT max(ended_at)+interval '2 years' FROM public.trainee_sessions WHERE id=ANY(sessions)),
  (SELECT max(created_at)+interval '2 years' FROM public.sandbox_customers WHERE session_id=ANY(sessions)),
  (SELECT max(created_at)+interval '2 years' FROM public.sandbox_game_accounts WHERE session_id=ANY(sessions)),
  (SELECT max(created_at)+interval '2 years' FROM public.sandbox_transaction_history WHERE session_id=ANY(sessions)),
  (SELECT max(greatest(created_at,"timestamp"))+interval '2 years' FROM public.trainee_action_logs WHERE session_id=ANY(sessions))) INTO due;
 counts:=jsonb_build_object('actions',(SELECT count(*) FROM public.hub_evaluation_action_evidence WHERE attempt_id=a.id),
  'stages',(SELECT count(*) FROM public.hub_final_stage_evidence WHERE attempt_id=a.id),'items',(SELECT count(*) FROM public.hub_scored_evaluation_item_results WHERE attempt_id=a.id),
  'runtime',(SELECT count(*) FROM public.hub_evaluation_runtime WHERE attempt_id=a.id),'worlds',cardinality(sessions),
  'settlements',(SELECT count(*) FROM public.hub_operation_evidence WHERE session_id=ANY(sessions)),
  'retries',(SELECT count(*) FROM public.hub_formal_retry_lineage WHERE attempt_id=a.id),
  'gameHistory',(SELECT count(*) FROM public.sandbox_game_history WHERE session_id=ANY(sessions)),
  'backendHistory',(SELECT count(*) FROM public.sandbox_transaction_history WHERE session_id=ANY(sessions)),
  'operations',(SELECT count(*) FROM public.sandbox_operations WHERE session_id=ANY(sessions)),
  'accounts',(SELECT count(*) FROM public.sandbox_game_accounts WHERE session_id=ANY(sessions)),
  'customers',(SELECT count(*) FROM public.sandbox_customers WHERE session_id=ANY(sessions)),
  'actionLogs',(SELECT count(*) FROM public.trainee_action_logs WHERE session_id=ANY(sessions)));
 IF a.completed_at IS NULL OR a.status='in_progress' OR NOT EXISTS(SELECT 1 FROM public.hub_evaluation_attempt_sets WHERE id=a.attempt_set_id AND status='closed') THEN blocked:=array_append(blocked,'attempt_set_not_closed');END IF;
 IF due IS NULL OR due>now() THEN blocked:=array_append(blocked,'retention_not_elapsed');END IF;
 IF coalesce(c.held,FALSE) THEN blocked:=array_append(blocked,'retention_hold');END IF;
 IF c.state='disposed' THEN blocked:=array_append(blocked,'already_disposed');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hub_evaluation_runtime WHERE attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_item_results WHERE attempt_id=a.id) THEN blocked:=array_append(blocked,'no_evidence_packet');END IF;
 IF EXISTS(SELECT 1 FROM public.trainee_sessions WHERE id=ANY(sessions) AND status NOT IN('completed','submitted')) OR
    EXISTS(SELECT 1 FROM public.hub_simulation_jobs WHERE session_id=ANY(sessions) AND status IN('ready','running')) THEN blocked:=array_append(blocked,'active_sandbox');END IF;
 IF EXISTS(SELECT 1 FROM public.hub_attempts WHERE legacy_trainee_session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_assessment_attempts WHERE legacy_trainee_session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_practice_contexts WHERE legacy_trainee_session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_account_practice WHERE session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_exception_practice WHERE session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_mixed_worlds WHERE session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_simulator_sessions WHERE session_id=ANY(sessions)) OR
    EXISTS(SELECT 1 FROM public.hub_assessment_operation_results WHERE sandbox_operation_id IN(SELECT id FROM public.sandbox_operations WHERE session_id=ANY(sessions))) OR
    EXISTS(SELECT 1 FROM public.hub_credential_practice WHERE operation_id IN(SELECT id FROM public.sandbox_operations WHERE session_id=ANY(sessions))) THEN blocked:=array_append(blocked,'shared_sandbox');END IF;
 IF EXISTS(SELECT 1 FROM public.sandbox_game_accounts WHERE customer_id IN(SELECT id FROM public.sandbox_customers WHERE session_id=ANY(sessions)) AND NOT(session_id=ANY(sessions))) OR
    EXISTS(SELECT 1 FROM public.sandbox_game_history WHERE (customer_id IN(SELECT id FROM public.sandbox_customers WHERE session_id=ANY(sessions)) OR game_account_id IN(SELECT id FROM public.sandbox_game_accounts WHERE session_id=ANY(sessions))) AND NOT(session_id=ANY(sessions))) OR
    EXISTS(SELECT 1 FROM public.sandbox_operations WHERE (customer_id IN(SELECT id FROM public.sandbox_customers WHERE session_id=ANY(sessions)) OR game_account_id IN(SELECT id FROM public.sandbox_game_accounts WHERE session_id=ANY(sessions))) AND NOT(session_id=ANY(sessions))) OR
    EXISTS(SELECT 1 FROM public.sandbox_transaction_history WHERE customer_id IN(SELECT id FROM public.sandbox_customers WHERE session_id=ANY(sessions)) AND NOT(session_id=ANY(sessions))) OR
    EXISTS(SELECT 1 FROM public.trainee_action_logs WHERE operation_id IN(SELECT id FROM public.sandbox_operations WHERE session_id=ANY(sessions)) AND NOT(session_id=ANY(sessions))) THEN blocked:=array_append(blocked,'shared_sandbox');END IF;
 IF EXISTS(SELECT 1 FROM public.hub_idempotency_keys k WHERE identity_id=a.identity_id AND action_code IN('evaluation_runtime','final_runtime') AND response IS NOT NULL AND response<>'{}' AND response<>'{"history":[]}' AND
   NOT EXISTS(SELECT 1 FROM public.hub_formal_retry_lineage l WHERE l.identity_id=k.identity_id AND l.action_code=k.action_code AND l.idempotency_key=k.idempotency_key)) THEN blocked:=array_append(blocked,'unattributed_retry_cache');END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN('public.trainee_sessions'::regclass,'public.hub_evaluation_runtime'::regclass,'public.hub_evaluation_worlds'::regclass,'public.hub_final_operation_plan'::regclass,'public.hub_evaluation_action_evidence'::regclass,'public.hub_final_stage_evidence'::regclass,'public.hub_scored_evaluation_item_results'::regclass,'public.hub_operation_evidence'::regclass,'public.sandbox_customers'::regclass,'public.sandbox_game_accounts'::regclass,'public.sandbox_operations'::regclass,'public.sandbox_game_history'::regclass,'public.sandbox_transaction_history'::regclass) AND conrelid NOT IN(
  'public.hub_final_stage_evidence'::regclass,'public.hub_assessment_operation_results'::regclass,'public.hub_credential_practice'::regclass,
  'public.hub_attempts'::regclass,'public.hub_assessment_attempts'::regclass,'public.hub_practice_contexts'::regclass,'public.hub_account_practice'::regclass,'public.hub_exception_practice'::regclass,'public.hub_mixed_worlds'::regclass,'public.hub_simulator_sessions'::regclass,
  'public.hub_evaluation_action_evidence'::regclass,'public.hub_evaluation_worlds'::regclass,'public.hub_final_operation_plan'::regclass,'public.hub_simulation_jobs'::regclass,'public.sandbox_customers'::regclass,'public.sandbox_game_accounts'::regclass,'public.sandbox_game_history'::regclass,'public.sandbox_game_wallets'::regclass,'public.sandbox_operations'::regclass,'public.sandbox_transaction_history'::regclass,'public.trainee_action_logs'::regclass)) THEN blocked:=array_append(blocked,'unreviewed_dependency');END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('attempt',to_jsonb(a),'counts',counts,'due',due,'sessions',to_jsonb(sessions))::text,'sha256'),'hex');
 RETURN jsonb_build_object('attemptId',a.id,'retainUntil',due,'counts',counts,'eligible',cardinality(blocked)=0,'blockers',to_jsonb(blocked),'fingerprint',fingerprint);
END; $$;

CREATE FUNCTION public.hub_formal_retention_preview(p_external_subject TEXT,p_attempt_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;result JSONB;c JSONB;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh']);
 result:=public.hub_formal_retention_state(p_attempt_id);
 SELECT to_jsonb(x)-'session_ids' INTO c FROM public.hub_formal_retention_cases x WHERE attempt_id=p_attempt_id;
 RETURN result||jsonb_build_object('case',coalesce(c,jsonb_build_object('revision',0,'state','none','held',FALSE)),
  'viewerId',actor,'canManage',EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=actor AND r.code='trainer'));
END; $$;

CREATE FUNCTION public.hub_formal_disposal_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public.hub_formal_retention_cases%ROWTYPE;old_data JSONB:=to_jsonb(OLD);
BEGIN
 IF TG_OP='DELETE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.hub_formal_retention_command(text,uuid,text,integer,text,text)'::regprocedure)) THEN
  SELECT * INTO c FROM public.hub_formal_retention_cases WHERE attempt_id=nullif(current_setting('trez.formal_disposal',TRUE),'')::uuid AND state='executing';
  IF FOUND AND ((TG_TABLE_NAME='hub_operation_evidence' AND (old_data->>'session_id')::uuid=ANY(c.session_ids)) OR (old_data->>'attempt_id')::uuid=c.attempt_id) THEN RETURN OLD;END IF;
 END IF;
 RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';
END; $$;
DROP TRIGGER hub_evaluation_action_evidence_immutable ON public.hub_evaluation_action_evidence;
DROP TRIGGER hub_final_stage_evidence_immutable ON public.hub_final_stage_evidence;
DROP TRIGGER hub_scored_evaluation_item_results_append_only ON public.hub_scored_evaluation_item_results;
DROP TRIGGER hub_operation_evidence_append_only ON public.hub_operation_evidence;
DROP TRIGGER hub_final_plan_guard ON public.hub_final_operation_plan;
CREATE TRIGGER hub_evaluation_action_evidence_immutable BEFORE UPDATE OR DELETE ON public.hub_evaluation_action_evidence FOR EACH ROW EXECUTE FUNCTION public.hub_formal_disposal_guard();
CREATE TRIGGER hub_final_stage_evidence_immutable BEFORE UPDATE OR DELETE ON public.hub_final_stage_evidence FOR EACH ROW EXECUTE FUNCTION public.hub_formal_disposal_guard();
CREATE TRIGGER hub_scored_evaluation_item_results_append_only BEFORE UPDATE OR DELETE ON public.hub_scored_evaluation_item_results FOR EACH ROW EXECUTE FUNCTION public.hub_formal_disposal_guard();
CREATE TRIGGER hub_operation_evidence_append_only BEFORE UPDATE OR DELETE ON public.hub_operation_evidence FOR EACH ROW EXECUTE FUNCTION public.hub_formal_disposal_guard();
CREATE TRIGGER hub_final_plan_guard BEFORE UPDATE ON public.hub_final_operation_plan FOR EACH ROW EXECUTE FUNCTION public.hub_guard_final_plan();
CREATE TRIGGER hub_final_plan_disposal_guard BEFORE DELETE ON public.hub_final_operation_plan FOR EACH ROW EXECUTE FUNCTION public.hub_formal_disposal_guard();

CREATE FUNCTION public.hub_formal_retention_command(p_external_subject TEXT,p_attempt_id UUID,p_command TEXT,p_expected_revision INTEGER,p_reason TEXT,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;c public.hub_formal_retention_cases%ROWTYPE;claim public.hub_idempotency_keys%ROWTYPE;fingerprint TEXT;s JSONB;result JSONB;sessions UUID[];
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
 IF p_command IS NULL OR p_command NOT IN('hold','release','request','cancel','approve') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hub-formal-retention:'||p_attempt_id,0));
 PERFORM 1 FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('attempt',p_attempt_id,'command',p_command,'revision',p_expected_revision,'reason',btrim(p_reason))::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(actor,'formal_retention',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=actor AND action_code='formal_retention' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
 INSERT INTO public.hub_formal_retention_cases(attempt_id) VALUES(p_attempt_id) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM public.hub_formal_retention_cases WHERE attempt_id=p_attempt_id FOR UPDATE;
 IF c.revision<>p_expected_revision OR c.state='disposed' THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
 IF p_command='hold' THEN
  IF c.held THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
  UPDATE public.hub_formal_retention_cases SET held=TRUE,hold_reason=btrim(p_reason),held_by=actor WHERE attempt_id=p_attempt_id;
 ELSIF p_command='release' THEN
  IF NOT c.held THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
  UPDATE public.hub_formal_retention_cases SET held=FALSE,hold_reason=btrim(p_reason),held_by=actor WHERE attempt_id=p_attempt_id;
 ELSIF p_command='cancel' THEN
  IF c.state<>'pending' THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
  UPDATE public.hub_formal_retention_cases SET state='cancelled',reviewed_by=actor,review_reason=btrim(p_reason) WHERE attempt_id=p_attempt_id;
 ELSE
  s:=public.hub_formal_retention_state(p_attempt_id);
  IF NOT(s->>'eligible')::boolean THEN RAISE EXCEPTION 'HUB_RETENTION_PROTECTED';END IF;
  IF p_command='request' THEN
   IF c.state='pending' THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
   UPDATE public.hub_formal_retention_cases SET state='pending',requested_by=actor,request_reason=btrim(p_reason),fingerprint=s->>'fingerprint',reviewed_by=NULL,review_reason=NULL WHERE attempt_id=p_attempt_id;
  ELSE
   IF c.state<>'pending' OR c.fingerprint<>s->>'fingerprint' THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
   IF c.requested_by=actor THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED';END IF;
   SELECT coalesce(array_agg(session_id),'{}') INTO sessions FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id;
   UPDATE public.hub_formal_retention_cases SET state='executing',session_ids=sessions WHERE attempt_id=p_attempt_id;
   PERFORM set_config('trez.formal_disposal',p_attempt_id::text,TRUE);
   DELETE FROM public.hub_idempotency_keys k USING public.hub_formal_retry_lineage l WHERE l.attempt_id=p_attempt_id AND k.identity_id=l.identity_id AND k.action_code=l.action_code AND k.idempotency_key=l.idempotency_key;
   DELETE FROM public.hub_evaluation_action_evidence WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_final_stage_evidence WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_scored_evaluation_item_results WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_final_operation_plan WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id;
   DELETE FROM public.hub_operation_evidence WHERE session_id=ANY(sessions);
   DELETE FROM public.trainee_sessions WHERE id=ANY(sessions);
   PERFORM set_config('trez.formal_disposal','',TRUE);
   UPDATE public.hub_formal_retention_cases SET state='disposed',session_ids='{}',disposed_at=clock_timestamp(),removed_counts=s->'counts',reviewed_by=actor,review_reason=btrim(p_reason) WHERE attempt_id=p_attempt_id;
  END IF;
 END IF;
 UPDATE public.hub_formal_retention_cases SET revision=revision+1 WHERE attempt_id=p_attempt_id RETURNING * INTO c;
 INSERT INTO public.hub_formal_retention_events(attempt_id,actor_id,action,reason,revision) VALUES(p_attempt_id,actor,p_command,btrim(p_reason),c.revision);
 result:=to_jsonb(c)-'session_ids';
 UPDATE public.hub_idempotency_keys SET response=result WHERE identity_id=actor AND action_code='formal_retention' AND idempotency_key=p_idempotency_key;
 RETURN result;
END; $$;
ALTER TABLE public.hub_formal_retention_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_formal_retention_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_formal_retry_lineage ENABLE ROW LEVEL SECURITY;
ALTER FUNCTION public.hub_assessment_report_rows(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) RENAME TO hub_assessment_report_rows_original;
REVOKE ALL ON FUNCTION public.hub_assessment_report_rows_original(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hub_assessment_report_rows(p_external_subject TEXT,p_learner_id UUID DEFAULT NULL,p_from TIMESTAMPTZ DEFAULT NULL,p_to TIMESTAMPTZ DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result JSONB;rows JSONB;
BEGIN
 result:=public.hub_assessment_report_rows_original(p_external_subject,p_learner_id,p_from,p_to);
 SELECT coalesce(jsonb_agg(CASE WHEN c.state='disposed' THEN a.value||jsonb_build_object('evidenceRetention',jsonb_build_object('state','disposed','disposedAt',c.disposed_at)) ELSE a.value END ORDER BY a.ordinality),'[]') INTO rows
 FROM jsonb_array_elements(result->'attempts') WITH ORDINALITY a(value,ordinality) LEFT JOIN public.hub_formal_retention_cases c ON c.attempt_id::text=a.value->>'id';
 RETURN jsonb_set(result,'{attempts}',rows);
END; $$;
REVOKE ALL ON FUNCTION public.hub_assessment_report_rows(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_assessment_report_rows(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;
REVOKE ALL ON public.hub_formal_retention_cases,public.hub_formal_retention_events,public.hub_formal_retry_lineage FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hub_formal_retention_cases,public.hub_formal_retention_events,public.hub_formal_retry_lineage TO service_role;
REVOKE ALL ON public.hub_evaluation_runtime,public.hub_evaluation_worlds,public.hub_evaluation_action_evidence,public.hub_final_stage_evidence,public.hub_final_operation_plan,public.hub_scored_evaluation_item_results,public.hub_operation_evidence FROM service_role;
GRANT SELECT ON public.hub_evaluation_runtime,public.hub_evaluation_worlds,public.hub_evaluation_action_evidence,public.hub_final_stage_evidence,public.hub_final_operation_plan,public.hub_scored_evaluation_item_results,public.hub_operation_evidence TO service_role;
REVOKE ALL ON FUNCTION public.hub_evaluation_runtime_command(TEXT,UUID,TEXT,JSONB,TEXT),public.hub_formal_retention_state(UUID),public.hub_formal_disposal_guard(),public.hub_formal_retention_preview(TEXT,UUID),public.hub_formal_retention_command(TEXT,UUID,TEXT,INTEGER,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hub_evaluation_runtime_command(TEXT,UUID,TEXT,JSONB,TEXT),public.hub_formal_retention_preview(TEXT,UUID),public.hub_formal_retention_command(TEXT,UUID,TEXT,INTEGER,TEXT,TEXT) TO service_role;
