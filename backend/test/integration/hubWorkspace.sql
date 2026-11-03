-- Local-only transactional fixtures. The runner must enforce the named local container.
BEGIN;
DO $$
DECLARE
  trainer UUID := gen_random_uuid(); learner UUID := gen_random_uuid(); other_learner UUID := gen_random_uuid();
  admin_a UUID := gen_random_uuid(); admin_b UUID := gen_random_uuid(); course UUID := gen_random_uuid();
  module UUID := gen_random_uuid(); activity UUID := gen_random_uuid(); result JSONB; replay JSONB;
  lab UUID:=gen_random_uuid(); creation UUID:=gen_random_uuid(); search_activity UUID:=gen_random_uuid(); search_module UUID:=gen_random_uuid();
  account_view JSONB; account_artifact UUID;
  reset_module UUID:=gen_random_uuid(); reset_activity UUID:=gen_random_uuid(); credential_view JSONB;
  queue_session UUID;queue_customer UUID;queue_operation UUID:=gen_random_uuid();job public.hub_simulation_jobs%ROWTYPE;claimed public.hub_simulation_jobs%ROWTYPE;
  queue_account UUID;scenario_operation UUID:=gen_random_uuid();old_lease UUID;
  policy_proposal JSONB;new_policy_id UUID;
  exception_module UUID:=gen_random_uuid();exception_activity UUID:=gen_random_uuid();exception_view JSONB;first_exception UUID;decision TEXT;history_count INTEGER;
  note UUID; version UUID; start_result JSONB; captured JSONB; count_rows INTEGER;
BEGIN
  INSERT INTO public.hub_identities(id,external_subject_reference,display_name) VALUES
    (trainer,'workspace-trainer','Workspace Trainer'),(learner,'workspace-learner','Workspace Learner'),
    (other_learner,'workspace-other','Workspace Other'),(admin_a,'workspace-admin-a','Admin A'),(admin_b,'workspace-admin-b','Admin B');
  INSERT INTO public.hub_role_assignments(identity_id,role_id)
  SELECT i.id,r.id FROM public.hub_identities i CROSS JOIN public.hub_roles r WHERE
    (i.id=trainer AND r.code='trainer') OR (i.id IN (learner,other_learner) AND r.code='postulante') OR (i.id IN (admin_a,admin_b) AND r.code='admin');
  INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'workspace-fixture','Workspace Fixture');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'workspace-module',1,'Workspace Module');
  INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content)
    VALUES(activity,module,'workspace-lesson',1,'article','Original lesson','{"summary":"Original instruction","surface":"protected-execution-config"}');
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course);
  start_result := public.hub_start_activity_attempt('workspace-learner',activity,'{}','workspace-start');
  SELECT definition_snapshot INTO captured FROM public.hub_activity_attempts WHERE id=(start_result->>'activityAttemptId')::uuid;
  IF captured->>'title' <> 'Original lesson' THEN RAISE EXCEPTION 'definition not captured'; END IF;
  result := public.hub_create_content_version('workspace-admin-a','activity',activity,'en',
    '{"title":"Updated lesson","instruction":{"summary":"New instruction","paragraphs":["Approved text"]}}','Improve instruction');
  version := (result->>'id')::uuid;
  PERFORM public.hub_submit_content_version('workspace-admin-a',version);
  BEGIN
    PERFORM public.hub_review_content_version('workspace-admin-a',version,'approve','Self review');
    RAISE EXCEPTION 'self approval unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_SEPARATE_APPROVER_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.hub_review_content_version('workspace-admin-b',version,'approve','Reviewed independently');
  IF NOT EXISTS(SELECT 1 FROM public.hub_activities WHERE id=activity AND title='Updated lesson'
    AND content->>'summary'='New instruction' AND content->>'surface'='protected-execution-config') THEN
    RAISE EXCEPTION 'published instruction did not apply safely'; END IF;
  IF (SELECT definition_snapshot FROM public.hub_activity_attempts WHERE id=(start_result->>'activityAttemptId')::uuid) IS DISTINCT FROM captured THEN
    RAISE EXCEPTION 'historical definition changed'; END IF;
  BEGIN
    UPDATE public.hub_content_versions SET content='{}' WHERE id=version;
    RAISE EXCEPTION 'published content unexpectedly editable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_PUBLISHED_CONTENT_IMMUTABLE' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.hub_activity_attempts SET definition_snapshot='{}' WHERE id=(start_result->>'activityAttemptId')::uuid;
    RAISE EXCEPTION 'attempt snapshot unexpectedly editable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_SNAPSHOT_IMMUTABLE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.hub_create_content_version('workspace-admin-a','activity',activity,'en',
      '{"title":"Unsafe","instruction":{"surface":"changed"}}','Attempt to change execution');
    RAISE EXCEPTION 'execution field unexpectedly editable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_INVALID_INSTRUCTION' THEN RAISE; END IF; END;
  result := public.hub_save_coaching_note('workspace-trainer',learner,NULL,NULL,0,'Review game history first','open',NULL,'workspace-note-1');
  note := (result->'note'->>'id')::uuid;
  replay := public.hub_save_coaching_note('workspace-trainer',learner,NULL,NULL,0,'Review game history first','open',NULL,'workspace-note-1');
  IF replay <> result THEN RAISE EXCEPTION 'retry did not return same revision'; END IF;
  BEGIN
    PERFORM public.hub_save_coaching_note('workspace-trainer',other_learner,NULL,NULL,0,'Review game history first','open',NULL,'workspace-note-1');
    RAISE EXCEPTION 'foreign retry unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
  PERFORM public.hub_save_coaching_note('workspace-trainer',learner,note,NULL,1,'Practice history review','practice_assigned',NULL,'workspace-note-2');
  BEGIN
    PERFORM public.hub_save_coaching_note('workspace-trainer',learner,note,NULL,1,'Stale edit','open',NULL,'workspace-stale');
    RAISE EXCEPTION 'stale edit unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_REVISION_CONFLICT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.hub_save_coaching_note('workspace-learner',learner,NULL,NULL,0,'Forged author','open',NULL,'workspace-forged');
    RAISE EXCEPTION 'learner author unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_ACCESS_DENIED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.hub_save_coaching_note('workspace-trainer',learner,note,NULL,2,'Claim verified','verified',NULL,'workspace-no-evidence');
    RAISE EXCEPTION 'unverified claim unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'HUB_VERIFICATION_EVIDENCE_REQUIRED' THEN RAISE; END IF; END;
  SELECT count(*) INTO count_rows FROM public.hub_coaching_note_revisions WHERE note_id=note;
  IF count_rows<>2 THEN RAISE EXCEPTION 'unexpected revision count'; END IF;
  IF has_table_privilege('anon','public.hub_coaching_notes','SELECT') OR has_table_privilege('authenticated','public.hub_coaching_notes','SELECT')
     OR has_function_privilege('anon','public.hub_save_coaching_note(text,uuid,uuid,uuid,integer,text,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'browser database role has private coaching access'; END IF;
  IF (result->'note'->>'retention_until')::timestamptz < now()+interval '23 months' THEN RAISE EXCEPTION 'retention missing'; END IF;

  INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content) VALUES
    (lab,module,'workspace-lab',2,'interactive_rule_lab','Rule Lab','{"policyStatus":"approved","executionKind":"account_id_lab","policyVersionId":"20000000-0000-4000-8000-000000000001"}'),
    (creation,module,'workspace-creation',3,'quick_simulation','Create Account','{"policyStatus":"approved","executionKind":"account_creation","policyVersionId":"20000000-0000-4000-8000-000000000001"}');
  account_view:=public.hub_account_practice_command('workspace-learner',lab,'start','{}','workspace-account-start');
  IF account_view->>'game'<>'Orion Stars' THEN RAISE EXCEPTION 'assigned game missing'; END IF;
  BEGIN
    PERFORM public.hub_complete_activity('workspace-learner',lab,'{"validation":{"correct":true}}','forged-rule-answer');
    RAISE EXCEPTION 'forged lab completion succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACTIVITY_BLOCKED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.hub_account_practice_command('workspace-learner',lab,'validate','{"identifier":"wrong"}','workspace-bad-rule');
    RAISE EXCEPTION 'incorrect identifier succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_IDENTIFIER_MISMATCH' THEN RAISE; END IF; END;
  account_view:=public.hub_account_practice_command('workspace-learner',lab,'validate','{"identifier":"OS_Practi123"}','workspace-rule-answer');
  IF NOT (account_view->>'labVerified')::boolean THEN RAISE EXCEPTION 'rule not verified'; END IF;
  account_view:=public.hub_account_practice_command('workspace-learner',creation,'create','{"identifier":"OS_Practi456","password":"fixture-only"}','workspace-create');
  replay:=public.hub_account_practice_command('workspace-learner',creation,'create','{"identifier":"OS_Practi456","password":"fixture-only"}','workspace-create');
  IF replay<>account_view THEN RAISE EXCEPTION 'account creation retry changed result'; END IF;
  BEGIN
    PERFORM public.hub_account_practice_command('workspace-learner',creation,'confirm','{"identifier":"OS_Practi456","password":"fixture-only"}','workspace-missing-kiosk');
    RAISE EXCEPTION 'missing kiosk succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCOUNT_CONFIRMATION_MISMATCH' THEN RAISE; END IF; END;
  account_view:=public.hub_account_practice_command('workspace-learner',creation,'confirm','{"identifier":"OS_Practi456","password":"fixture-only","kiosk":"OrionStars"}','workspace-confirm');
  account_artifact:=(account_view->>'artifactId')::uuid;
  IF account_artifact IS NULL OR account_view::text LIKE '%fixture-only%' THEN RAISE EXCEPTION 'artifact missing or secret leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_attempt_artifacts WHERE id=account_artifact AND payload->>'identifier'='OS_Practi456'
    AND NOT payload ? 'password') THEN RAISE EXCEPTION 'durable artifact invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sandbox_operations WHERE id=(account_view#>>'{operation,id}')::uuid AND status='APPROVED' AND is_correct) THEN RAISE EXCEPTION 'Backend request not confirmed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_operation_evidence WHERE id=(account_view#>>'{operation,id}')::uuid AND snapshot->>'isCorrect'='true'
    AND snapshot#>>'{gameAccount,game_username}'='OS_Practi456' AND snapshot::text NOT LIKE '%fixture-only%') THEN RAISE EXCEPTION 'settlement evidence missing or leaked password'; END IF;
  UPDATE public.sandbox_game_accounts SET balance=99 WHERE id=(account_view#>>'{account,id}')::uuid;
  IF (SELECT snapshot#>>'{gameAccount,balance}' FROM public.hub_operation_evidence WHERE id=(account_view#>>'{operation,id}')::uuid)<>'0' THEN RAISE EXCEPTION 'snapshot balance drifted'; END IF;
  BEGIN
    UPDATE public.sandbox_operations SET final_evidence_snapshot='{}' WHERE id=(account_view#>>'{operation,id}')::uuid;
    RAISE EXCEPTION 'settlement snapshot unexpectedly editable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_SNAPSHOT_IMMUTABLE' THEN RAISE; END IF; END;
  PERFORM public.hub_complete_activity('workspace-learner',activity,'{}','workspace-original-complete');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(search_module,course,'workspace-search',2,'Search');
  INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content)
    VALUES(search_activity,search_module,'workspace-search',1,'focused_practice','Search created account','{"executionKind":"exact_player_search","artifactStatus":"available"}');
  BEGIN
    PERFORM public.hub_complete_activity('workspace-learner',search_activity,'{"sourceArtifactId":"00000000-0000-4000-8000-000000000000"}','workspace-forged-artifact');
    RAISE EXCEPTION 'forged search artifact succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACTIVITY_BLOCKED' THEN RAISE; END IF; END;
  PERFORM public.hub_complete_activity('workspace-learner',search_activity,jsonb_build_object('sourceArtifactId',account_artifact,
    'searchProcedure',jsonb_build_object('ctrlFObserved',TRUE,'ctrlVObserved',TRUE,'confirmed',TRUE,'exactQuery','OS_Practi456','matchedIdentifier','OS_Practi456')),'workspace-search-complete');
  IF (SELECT count(*) FROM public.sandbox_game_accounts WHERE id=(account_view#>>'{account,id}')::uuid)<>1 THEN RAISE EXCEPTION 'duplicate account'; END IF;
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(reset_module,course,'workspace-reset',3,'Reset');
  INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content)
    VALUES(reset_activity,reset_module,'workspace-reset',1,'quick_simulation','Reset assigned account','{"executionKind":"reset_current_account","policyStatus":"approved"}');
  credential_view:=public.hub_credential_practice_command('workspace-learner',reset_activity,'start','{}','workspace-reset-start');
  BEGIN
    PERFORM public.hub_complete_activity('workspace-learner',reset_activity,'{"serverVerified":true}','workspace-reset-forged');
    RAISE EXCEPTION 'forged reset completion succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACTIVITY_BLOCKED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.hub_credential_practice_command('workspace-learner',reset_activity,'confirm','{"identifier":"OS_Practi456","password":"fixture-only","kiosk":"OrionStars"}','workspace-reset-no-action');
    RAISE EXCEPTION 'reset confirmation without game action succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCOUNT_CONFIRMATION_MISMATCH' THEN RAISE; END IF; END;
  credential_view:=public.hub_credential_practice_command('workspace-learner',reset_activity,'reset','{"identifier":"OS_Practi456","password":"replacement-fixture-only"}','workspace-reset-action');
  credential_view:=public.hub_credential_practice_command('workspace-learner',reset_activity,'confirm','{"identifier":"OS_Practi456","password":"replacement-fixture-only","kiosk":"OrionStars"}','workspace-reset-confirm');
  IF NOT (credential_view->>'confirmed')::boolean OR credential_view::text LIKE '%replacement-fixture-only%' THEN RAISE EXCEPTION 'reset missing or leaked secret'; END IF;

  INSERT INTO public.trainee_sessions(trainee_name,runtime_mode,status,duration_minutes)
    VALUES('Workspace queue fixture','free_simulator','active',5) RETURNING id INTO queue_session;
  INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(queue_session,'QueueCustomer',100) RETURNING id INTO queue_customer;
  SELECT * INTO job FROM public.hub_claim_simulation_job();
  IF job.id IS NULL OR job.session_id<>queue_session THEN RAISE EXCEPTION 'durable job not claimed'; END IF;
  SELECT * INTO claimed FROM public.hub_claim_simulation_job();
  IF claimed.id=job.id THEN RAISE EXCEPTION 'live lease was claimed twice'; END IF;
  IF public.hub_renew_simulation_job(job.id,gen_random_uuid()) THEN RAISE EXCEPTION 'foreign lease renewed'; END IF;
  PERFORM public.create_fenced_sandbox_operation(job.id,job.lease_token,jsonb_build_object('id',queue_operation,'session_id',queue_session,'customer_id',queue_customer,'game','Orion Stars','type','CREATE ACCOUNT','created_at',now()));
  BEGIN
    PERFORM public.create_fenced_sandbox_operation(job.id,gen_random_uuid(),jsonb_build_object('id',gen_random_uuid(),'session_id',queue_session,'customer_id',queue_customer,'game','Orion Stars','type','CREATE ACCOUNT','created_at',now()));
    RAISE EXCEPTION 'stale worker inserted operation';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_WORKER_LEASE_LOST' THEN RAISE; END IF; END;
  INSERT INTO public.sandbox_game_wallets(session_id,game,balance) VALUES(queue_session,'Orion Stars',20000);
  INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,password,balance)
    VALUES(queue_session,queue_customer,'Orion Stars','OS_Queue123','disposable-only',100) RETURNING id INTO queue_account;
  result:=jsonb_build_object('id',scenario_operation,'session_id',queue_session,'customer_id',queue_customer,'game_account_id',queue_account,'game','Orion Stars','type','ADD CREDITS','amount',50,'customer_balance_at_request',100,'game_balance_at_request',100,'created_at',now(),'_movementScenario','ALREADY_PROCESSED','_botApplied',TRUE);
  PERFORM public.create_fenced_sandbox_operation(job.id,job.lease_token,result);
  PERFORM public.create_fenced_sandbox_operation(job.id,job.lease_token,result);
  IF (SELECT balance FROM public.sandbox_game_accounts WHERE id=queue_account)<>150
    OR (SELECT count(*) FROM public.sandbox_game_history WHERE game_account_id=queue_account)<>1 THEN RAISE EXCEPTION 'durable retry duplicated or omitted game posting'; END IF;
  old_lease:=job.lease_token;
  UPDATE public.hub_simulation_jobs SET lease_until=now()-interval '1 second' WHERE id=job.id;
  SELECT * INTO job FROM public.hub_claim_simulation_job();
  IF job.lease_token=old_lease OR job.sequence_number<>1 THEN RAISE EXCEPTION 'crashed delivery was not reclaimed with a fresh lease'; END IF;
  IF public.hub_finish_simulation_job(job.id,old_lease,TRUE) THEN RAISE EXCEPTION 'stale worker finished reclaimed job'; END IF;
  PERFORM public.create_fenced_sandbox_operation(job.id,job.lease_token,result);
  IF (SELECT balance FROM public.sandbox_game_accounts WHERE id=queue_account)<>150 THEN RAISE EXCEPTION 'replacement worker duplicated game posting'; END IF;
  IF NOT public.hub_finish_simulation_job(job.id,job.lease_token,TRUE) THEN RAISE EXCEPTION 'job completion failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_simulation_jobs WHERE id=job.id AND sequence_number=2 AND status='ready' AND lease_token IS NULL) THEN RAISE EXCEPTION 'job did not persist next tick'; END IF;
  UPDATE public.trainee_sessions SET status='submitted' WHERE id=queue_session;
  IF NOT EXISTS(SELECT 1 FROM public.hub_simulation_jobs WHERE id=job.id AND status='completed') THEN RAISE EXCEPTION 'job survived stopped session'; END IF;
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(exception_module,course,'workspace-exception',4,'Exceptions');
  INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content)
    VALUES(exception_activity,exception_module,'workspace-exception',1,'quick_simulation','Exception decision','{"executionKind":"exception_decision","policyStatus":"approved"}');
  exception_view:=public.hub_exception_practice_command('workspace-learner',exception_activity,'start','{}','workspace-exception-start');
  first_exception:=(exception_view->>'id')::uuid;
  BEGIN
    PERFORM public.hub_complete_activity('workspace-learner',exception_activity,'{"serverVerified":true}','workspace-exception-forged');
    RAISE EXCEPTION 'forged exception completion succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACTIVITY_BLOCKED' THEN RAISE; END IF; END;
  decision:=CASE WHEN exception_view->>'scenario'='PLAYER_IN_GAME' OR jsonb_array_length(exception_view->'history')=0 THEN 'CANCELLED' ELSE 'APPROVED' END;
  exception_view:=public.hub_exception_practice_command('workspace-learner',exception_activity,'answer',jsonb_build_object('action',CASE WHEN decision='APPROVED' THEN 'CANCELLED' ELSE 'APPROVED' END,'reason','Intentionally wrong fixture choice'),'workspace-exception-wrong');
  IF exception_view->>'result'<>'false' THEN RAISE EXCEPTION 'incorrect exception decision accepted'; END IF;
  exception_view:=public.hub_exception_practice_command('workspace-learner',exception_activity,'start','{}','workspace-exception-retry');
  IF exception_view->>'id'=first_exception::text THEN RAISE EXCEPTION 'practice retry did not create a fresh case'; END IF;
  history_count:=jsonb_array_length(exception_view->'history');
  decision:=CASE WHEN exception_view->>'scenario'='PLAYER_IN_GAME' OR history_count=0 THEN 'CANCELLED' ELSE 'APPROVED' END;
  exception_view:=public.hub_exception_practice_command('workspace-learner',exception_activity,'answer',jsonb_build_object('action',decision,'reason','Verified the exact account game history and current scenario'),'workspace-exception-correct');
  IF exception_view->>'result'<>'true' OR jsonb_array_length(exception_view->'history')<>history_count THEN RAISE EXCEPTION 'exception decision failed or repeated game movement'; END IF;
  policy_proposal:=public.hub_propose_account_policy('workspace-admin-a','20000000-0000-4000-8000-000000000001',
    '{"label":"Revised fixture structure","prefix":"ZX_","suffix":"","customerLength":4,"digits":2}','Policy revision fixture');
  BEGIN
    PERFORM public.hub_review_account_policy('workspace-admin-a',(policy_proposal->>'id')::uuid,'approve','Self approval');
    RAISE EXCEPTION 'policy self approval succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_SEPARATE_APPROVER_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.hub_review_account_policy('workspace-admin-b',(policy_proposal->>'id')::uuid,'approve','Independent review');
  SELECT (content->>'policyVersionId')::uuid INTO new_policy_id FROM public.hub_activities WHERE id=lab;
  IF new_policy_id='20000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'new policy not applied'; END IF;
  IF (SELECT policy_id FROM public.hub_account_practice WHERE id=(account_view->>'id')::uuid)<>'20000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'existing attempt policy drifted'; END IF;
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(other_learner,course);
  account_view:=public.hub_account_practice_command('workspace-other',lab,'start','{}','workspace-new-policy-start');
  IF account_view->>'policyVersionId'<>new_policy_id::text THEN RAISE EXCEPTION 'new attempt did not use new policy'; END IF;
  PERFORM public.hub_account_practice_command('workspace-other',lab,'validate','{"identifier":"ZX_Prac12"}','workspace-new-policy-answer');
END; $$;
ROLLBACK;
