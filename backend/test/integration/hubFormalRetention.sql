-- Loaded by hub-integration-cases.mjs inside a rollback-only transaction with
-- real completed Orion/final runtimes. No hosted target or fake passing verdict.
CREATE FUNCTION pg_temp.formal_denied(p_subject TEXT,p_attempt UUID,p_command TEXT,p_revision INTEGER,p_error TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM public.hub_formal_retention_command(p_subject,p_attempt,p_command,p_revision,'Isolated formal retention check',gen_random_uuid()::text);RAISE EXCEPTION 'Unexpected disposal success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>p_error THEN RAISE;END IF;END;
END; $$;
DO $$
DECLARE reviewer UUID:=gen_random_uuid();rrhh UUID:=gen_random_uuid();admin UUID:=gen_random_uuid();a UUID;f UUID;official UUID;open_attempt UUID;learner UUID;session UUID;set_id UUID;result JSONB;state JSONB;before_attempt JSONB;before_set JSONB;before_progress JSONB;report JSONB;key TEXT;lineage_count INTEGER;set_count INTEGER;legacy public.hub_formal_retry_lineage%ROWTYPE;
BEGIN
 INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(reviewer,'formal-retention-reviewer'),(rrhh,'formal-retention-rrhh'),(admin,'formal-retention-admin');
 INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT i.id,r.id FROM public.hub_identities i CROSS JOIN public.hub_roles r WHERE
 (i.id=reviewer AND r.code='trainer') OR(i.id=rrhh AND r.code='rrhh') OR(i.id=admin AND r.code='admin');
 SELECT x.id,x.identity_id,x.attempt_set_id INTO a,learner,set_id FROM public.hub_scored_evaluation_attempts x JOIN public.hub_identities i ON i.id=x.identity_id WHERE i.external_subject_reference='runtime-learner' ORDER BY attempt_in_set DESC LIMIT 1;
 state:=public.hub_formal_retention_preview('runtime-trainer',a);
 IF NOT(state->'blockers' ? 'retention_not_elapsed') THEN RAISE EXCEPTION 'Recent evidence not protected';END IF;
 PERFORM pg_temp.formal_denied('runtime-trainer',a,'request',0,'HUB_RETENTION_PROTECTED');
 PERFORM pg_temp.age_formal(a);
 state:=public.hub_formal_retention_state(a);IF NOT(state->>'eligible')::boolean THEN RAISE EXCEPTION 'Old closed packet not eligible: %',state;END IF;
 SELECT session_id INTO session FROM public.hub_evaluation_worlds WHERE attempt_id=a LIMIT 1;
 SELECT idempotency_key INTO key FROM public.hub_formal_retry_lineage WHERE attempt_id=a LIMIT 1;
 SELECT count(*) INTO lineage_count FROM public.hub_formal_retry_lineage WHERE attempt_id=a;
 IF lineage_count=0 THEN RAISE EXCEPTION 'Retry lineage not captured';END IF;
 PERFORM pg_temp.formal_denied('runtime-learner',a,'request',0,'HUB_ACCESS_DENIED');
 PERFORM pg_temp.formal_denied('formal-retention-rrhh',a,'request',0,'HUB_ACCESS_DENIED');
 PERFORM pg_temp.formal_denied('formal-retention-admin',a,'request',0,'HUB_ACCESS_DENIED');
 BEGIN PERFORM public.hub_formal_retention_preview('runtime-learner',a);RAISE EXCEPTION 'Learner accessed private retention';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 state:=public.hub_formal_retention_preview('formal-retention-rrhh',a);IF (state->>'canManage')::boolean THEN RAISE EXCEPTION 'RRHH may mutate retention';END IF;
 result:=public.hub_formal_retention_command('runtime-trainer',a,'request',0,'Old closed packet independently reviewable','formal-request');
 IF result<>public.hub_formal_retention_command('runtime-trainer',a,'request',0,'Old closed packet independently reviewable','formal-request') THEN RAISE EXCEPTION 'Request replay changed';END IF;
 PERFORM pg_temp.formal_denied('runtime-trainer',a,'approve',1,'HUB_SEPARATE_APPROVER_REQUIRED');
 BEGIN DELETE FROM public.hub_evaluation_action_evidence WHERE attempt_id=a;RAISE EXCEPTION 'Ordinary evidence deletion succeeded';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_HISTORY_IMMUTABLE' THEN RAISE;END IF;END;
 PERFORM set_config('trez.formal_disposal',a::text,TRUE);
 BEGIN DELETE FROM public.hub_evaluation_action_evidence WHERE attempt_id=a;RAISE EXCEPTION 'Marker bypassed pending request';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_HISTORY_IMMUTABLE' THEN RAISE;END IF;END;
 PERFORM set_config('trez.formal_disposal','',TRUE);
 result:=public.hub_formal_retention_command('formal-retention-reviewer',a,'hold',1,'Preserve for an outstanding review','formal-hold');
 PERFORM pg_temp.formal_denied('formal-retention-reviewer',a,'approve',2,'HUB_RETENTION_PROTECTED');
 PERFORM public.hub_formal_retention_command('runtime-trainer',a,'release',2,'Outstanding review has been completed','formal-release');
 PERFORM pg_temp.formal_denied('formal-retention-reviewer',a,'approve',1,'HUB_RETENTION_STATE_CONFLICT');
 SELECT to_jsonb(x) INTO before_attempt FROM public.hub_scored_evaluation_attempts x WHERE id=a;
 SELECT to_jsonb(x) INTO before_set FROM public.hub_evaluation_attempt_sets x WHERE id=set_id;
 SELECT count(*) INTO set_count FROM public.hub_scored_evaluation_attempts WHERE attempt_set_id=set_id;
 result:=public.hub_formal_retention_command('formal-retention-reviewer',a,'approve',3,'Independent age and dependency review completed','formal-approve');
 IF result->>'state'<>'disposed' OR (result->'removed_counts'->>'actions')::integer<>7 THEN RAISE EXCEPTION 'Exact raw evidence not disposed';END IF;
 IF result<>public.hub_formal_retention_command('formal-retention-reviewer',a,'approve',3,'Independent age and dependency review completed','formal-approve') THEN RAISE EXCEPTION 'Approval replay changed';END IF;
 IF (SELECT to_jsonb(x) FROM public.hub_scored_evaluation_attempts x WHERE id=a)<>before_attempt OR (SELECT to_jsonb(x) FROM public.hub_evaluation_attempt_sets x WHERE id=set_id)<>before_set OR (SELECT count(*) FROM public.hub_scored_evaluation_attempts WHERE attempt_set_id=set_id)<>set_count THEN RAISE EXCEPTION 'Disposal changed grade or consumed attempts';END IF;
 IF EXISTS(SELECT 1 FROM public.hub_evaluation_runtime WHERE attempt_id=a) OR EXISTS(SELECT 1 FROM public.trainee_sessions WHERE id=session) OR EXISTS(SELECT 1 FROM public.hub_formal_retry_lineage WHERE attempt_id=a) THEN RAISE EXCEPTION 'Packet copies remain';END IF;
 BEGIN PERFORM public.hub_evaluation_runtime_command('runtime-learner',a,'start','{}',key);RAISE EXCEPTION 'Disposed runtime replay returned old data';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_FORMAL_EVIDENCE_DISPOSED' THEN RAISE;END IF;END;
 IF NOT EXISTS(SELECT 1 FROM public.hub_evaluation_action_evidence WHERE attempt_id<>a) THEN RAISE EXCEPTION 'Other attempts lost evidence';END IF;
 -- Real final-shift packet includes two-stage rows, operation snapshots and worlds.
 SELECT x.id INTO f FROM public.hub_scored_evaluation_attempts x JOIN public.hub_identities i ON i.id=x.identity_id WHERE i.external_subject_reference='final-runtime-1';
 PERFORM public.hub_submit_scored_evaluation_attempt('final-runtime-1',f);PERFORM pg_temp.age_formal(f);
 SELECT to_jsonb(x) INTO before_attempt FROM public.hub_scored_evaluation_attempts x WHERE id=f;
 result:=public.hub_formal_retention_command('runtime-trainer',f,'request',0,'Review final shift detailed evidence','final-disposal-request');
 result:=public.hub_formal_retention_command('formal-retention-reviewer',f,'approve',1,'Independent final packet review completed','final-disposal-approve');
 IF result->>'state'<>'disposed' OR (result->'removed_counts'->>'stages')::integer=0 THEN RAISE EXCEPTION 'Final stage packet not disposed';END IF;
 IF (SELECT to_jsonb(x) FROM public.hub_scored_evaluation_attempts x WHERE id=f)<>before_attempt THEN RAISE EXCEPTION 'Final score changed';END IF;
 BEGIN PERFORM public.hub_start_scored_evaluation_attempt('final-runtime-1','10000000-0000-4000-8000-000000000404','post-disposal-fourth');RAISE EXCEPTION 'Disposal reset attempt set';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'EVALUATION_REOPEN_REQUIRED' THEN RAISE;END IF;END;
 report:=public.hub_assessment_report_rows('runtime-trainer');IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'attempts')x WHERE x->>'id'=f::text AND (x->>'score')::numeric=100) THEN RAISE EXCEPTION 'Disposed result disappeared from reports';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'attempts')x WHERE x->>'id'=f::text AND x#>>'{evidenceRetention,state}'='disposed') THEN RAISE EXCEPTION 'Report omitted disposal marker';END IF;
 SELECT x.id INTO official FROM public.hub_scored_evaluation_attempts x JOIN public.hub_identities i ON i.id=x.identity_id WHERE i.external_subject_reference='runtime-official';
 PERFORM pg_temp.age_formal(official);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO before_progress FROM public.hub_module_progress p JOIN public.hub_enrolments e ON e.id=p.enrolment_id JOIN public.hub_identities i ON i.id=e.identity_id WHERE i.external_subject_reference='runtime-official';
 PERFORM public.hub_formal_retention_command('runtime-trainer',official,'request',0,'Review official result detail only','official-disposal-request');
 PERFORM public.hub_formal_retention_command('formal-retention-reviewer',official,'approve',1,'Keep official progress and consumed attempts','official-disposal-approve');
 IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.hub_module_progress p JOIN public.hub_enrolments e ON e.id=p.enrolment_id JOIN public.hub_identities i ON i.id=e.identity_id WHERE i.external_subject_reference='runtime-official') IS DISTINCT FROM before_progress THEN RAISE EXCEPTION 'Official readiness progress changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts WHERE id=official AND score=100 AND status='submitted') THEN RAISE EXCEPTION 'Official success was lost';END IF;
 SELECT x.id INTO open_attempt FROM public.hub_scored_evaluation_attempts x JOIN public.hub_identities i ON i.id=x.identity_id WHERE i.external_subject_reference='final-runtime-2';PERFORM pg_temp.age_formal(open_attempt);
 IF NOT(public.hub_formal_retention_state(open_attempt)->'blockers' ? 'attempt_set_not_closed') THEN RAISE EXCEPTION 'Open set lost protection';END IF;
 PERFORM public.hub_submit_scored_evaluation_attempt('final-runtime-2',open_attempt);PERFORM pg_temp.age_formal(open_attempt);
 SELECT session_id INTO session FROM public.hub_evaluation_worlds WHERE attempt_id=open_attempt LIMIT 1;
 SELECT identity_id INTO learner FROM public.hub_scored_evaluation_attempts WHERE id=open_attempt;
 INSERT INTO public.hub_simulator_sessions(session_id,identity_id) VALUES(session,learner);
 IF NOT(public.hub_formal_retention_state(open_attempt)->'blockers' ? 'shared_sandbox') THEN RAISE EXCEPTION 'Shared sandbox not protected';END IF;
 DELETE FROM public.hub_simulator_sessions WHERE session_id=session;
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint,response) VALUES(learner,'final_runtime','unattributed-history',repeat('0',64),'{"history":[{"id":"unknown-legacy-history","amount":1}]}');
 PERFORM public.hub_backfill_formal_retry_lineage();
 IF NOT(public.hub_formal_retention_state(open_attempt)->'blockers' ? 'unattributed_retry_cache') THEN RAISE EXCEPTION 'Unattributed legacy cache not protected';END IF;
 DELETE FROM public.hub_idempotency_keys WHERE identity_id=learner AND action_code='final_runtime' AND idempotency_key='unattributed-history';
 SELECT l.* INTO legacy FROM public.hub_formal_retry_lineage l JOIN public.hub_idempotency_keys k USING(identity_id,action_code,idempotency_key) WHERE jsonb_typeof(k.response->'history')='array' AND jsonb_array_length(k.response->'history')>0 LIMIT 1;
 IF legacy.attempt_id IS NULL THEN RAISE EXCEPTION 'No real history cache available for upgrade rehearsal';END IF;
 DELETE FROM public.hub_formal_retry_lineage WHERE identity_id=legacy.identity_id AND action_code=legacy.action_code AND idempotency_key=legacy.idempotency_key;
 PERFORM public.hub_backfill_formal_retry_lineage();
 IF NOT EXISTS(SELECT 1 FROM public.hub_formal_retry_lineage WHERE identity_id=legacy.identity_id AND action_code=legacy.action_code AND idempotency_key=legacy.idempotency_key AND attempt_id=legacy.attempt_id) THEN RAISE EXCEPTION 'Real legacy history ownership was not restored';END IF;
 CREATE TABLE public.__trez_unexpected_formal_dependency(attempt UUID REFERENCES public.hub_evaluation_runtime(attempt_id));
 IF NOT(public.hub_formal_retention_state(open_attempt)->'blockers' ? 'unreviewed_dependency') THEN RAISE EXCEPTION 'Future dependency not protected';END IF;
 DROP TABLE public.__trez_unexpected_formal_dependency;
 IF has_table_privilege('service_role','public.hub_evaluation_action_evidence','DELETE') OR has_function_privilege('authenticated','public.hub_formal_retention_command(text,uuid,text,integer,text,text)','EXECUTE') OR has_function_privilege('service_role','public.hub_evaluation_runtime_command_original(text,uuid,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe formal disposal grant';END IF;
END; $$;
