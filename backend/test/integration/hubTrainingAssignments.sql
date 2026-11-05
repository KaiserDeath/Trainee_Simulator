BEGIN;
DO $$
DECLARE v_trainer UUID:=gen_random_uuid();v_learner UUID:=gen_random_uuid();v_other UUID:=gen_random_uuid();
 v_hr UUID:=gen_random_uuid();v_course UUID:=gen_random_uuid();v_module UUID:=gen_random_uuid();v_activity UUID:=gen_random_uuid();
 v_assignment JSONB;v_replay JSONB;v_ack JSONB;v_verified JSONB;v_before JSONB;v_old UUID;v_new UUID:=gen_random_uuid();v_progress UUID;v_page JSONB;
BEGIN
 INSERT INTO hub_identities(id,external_subject_reference,display_name) VALUES
 (v_trainer,'target-trainer','Trainer'),(v_learner,'target-learner','Learner'),(v_other,'target-other','Other'),(v_hr,'target-hr','HR');
 INSERT INTO hub_role_assignments(identity_id,role_id) SELECT i.id,r.id FROM hub_identities i CROSS JOIN hub_roles r WHERE
 (i.id=v_trainer AND r.code='trainer') OR (i.id IN(v_learner,v_other) AND r.code='postulante') OR (i.id=v_hr AND r.code='rrhh');
 INSERT INTO hub_courses(id,stable_code,title) VALUES(v_course,'target-fixture','Targeted training');
 INSERT INTO hub_modules(id,course_id,stable_code,title,position) VALUES(v_module,v_course,'lesson','Review lesson',1);
 INSERT INTO hub_activities(id,module_id,stable_code,title,activity_type,position) VALUES(v_activity,v_module,'read','Read','article',1);
 INSERT INTO hub_enrolments(identity_id,course_id) VALUES(v_learner,v_course);
 PERFORM hub_complete_activity('target-learner',v_activity,'{}','target-complete-original');
 SELECT a.id,a.module_progress_id,to_jsonb(a) INTO v_old,v_progress,v_before FROM hub_attempts a
  JOIN hub_module_progress p ON p.id=a.module_progress_id JOIN hub_enrolments e ON e.id=p.enrolment_id
  WHERE e.identity_id=v_learner AND a.module_id=v_module;
 v_assignment:=hub_training_assignment_command('target-trainer','assign',NULL,v_learner,v_module,
  'reinforcement','Review exact customer verification',NULL,0,NULL,'target-create');
 v_replay:=hub_training_assignment_command('target-trainer','assign',NULL,v_learner,v_module,
  'reinforcement','Review exact customer verification',NULL,0,NULL,'target-create');
 IF v_assignment<>v_replay THEN RAISE EXCEPTION 'assignment replay changed result';END IF;
 BEGIN
  PERFORM hub_training_assignment_command('target-trainer','assign',NULL,v_learner,v_module,
   'reinforcement','Different assignment reason',NULL,0,NULL,'target-create');RAISE EXCEPTION 'changed retry accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_IDEMPOTENCY_CONFLICT' THEN RAISE;END IF;END;
 BEGIN
  PERFORM hub_training_assignment_command('target-hr','assign',NULL,v_learner,v_module,
   'reinforcement','Unpermitted assignment',NULL,0,NULL,'target-hr-write');RAISE EXCEPTION 'HR assignment write accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM hub_training_assignment_command('target-other','acknowledge',(v_assignment->>'id')::uuid,NULL,NULL,
   NULL,'Forged acknowledgment',NULL,1,NULL,'target-foreign-ack');RAISE EXCEPTION 'foreign acknowledgment accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 v_ack:=hub_training_assignment_command('target-learner','acknowledge',(v_assignment->>'id')::uuid,NULL,NULL,
  NULL,'Learner reviewed the assignment',NULL,1,NULL,'target-ack');
 IF v_ack->>'status'<>'acknowledged' OR v_ack->>'verification_attempt_id' IS NOT NULL THEN RAISE EXCEPTION 'acknowledgment certified learning';END IF;
 BEGIN
  PERFORM hub_training_assignment_command('target-trainer','verify',(v_assignment->>'id')::uuid,NULL,NULL,
   NULL,'Attempt predates this assignment',NULL,2,v_old,'target-old-evidence');RAISE EXCEPTION 'old evidence accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_VERIFICATION_EVIDENCE_REQUIRED' THEN RAISE;END IF;END;
 -- A second completed attempt is an isolated SQL fixture, not a human competency result.
 INSERT INTO hub_attempts(id,module_progress_id,module_id,attempt_number,status,started_at,completed_at)
 VALUES(v_new,v_progress,v_module,2,'completed',clock_timestamp(),clock_timestamp());
 v_verified:=hub_training_assignment_command('target-trainer','verify',(v_assignment->>'id')::uuid,NULL,NULL,
  NULL,'Later completed module evidence reviewed',NULL,2,v_new,'target-verify');
 IF v_verified->>'status'<>'verified' OR (v_verified->>'verification_attempt_id')::uuid<>v_new THEN RAISE EXCEPTION 'verification missing evidence';END IF;
 IF (SELECT to_jsonb(a) FROM hub_attempts a WHERE a.id=v_old)<>v_before THEN RAISE EXCEPTION 'original result changed';END IF;
 IF (SELECT count(*) FROM hub_training_assignment_events WHERE assignment_id=(v_assignment->>'id')::uuid)<>3 THEN RAISE EXCEPTION 'assignment audit events missing';END IF;
 IF jsonb_array_length(hub_list_training_assignments('target-other',NULL,NULL)->'assignments')<>0 THEN RAISE EXCEPTION 'foreign learner records leaked';END IF;
 IF jsonb_array_length(hub_list_training_assignments('target-hr',v_learner,NULL)->'assignments')<>1 THEN RAISE EXCEPTION 'HR cannot read permitted learner';END IF;
 BEGIN
  PERFORM hub_list_training_assignments('target-other',v_learner,NULL);RAISE EXCEPTION 'foreign explicit read accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 INSERT INTO hub_training_assignments(learner_id,module_id,assigned_by,purpose,reason)
 SELECT v_learner,v_module,v_trainer,'reinforcement','Paging fixture only' FROM generate_series(1,51);
 v_page:=hub_list_training_assignments('target-learner',NULL,NULL);
 IF jsonb_array_length(v_page->'assignments')<>50 OR v_page->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'unbounded assignment page';END IF;
 IF jsonb_array_length(hub_list_training_assignments('target-learner',NULL,(v_page->>'nextCursor')::uuid)->'assignments')<>2 THEN RAISE EXCEPTION 'assignment cursor lost rows';END IF;
 IF has_table_privilege('service_role','hub_training_assignments','INSERT') OR has_table_privilege('authenticated','hub_training_assignments','SELECT')
 OR has_function_privilege('anon','hub_list_training_assignments(text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'public assignment access exposed';END IF;
END;$$;
ROLLBACK;
