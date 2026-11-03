BEGIN;
DO $$
DECLARE trainer UUID:=gen_random_uuid(); learner UUID:=gen_random_uuid(); other_learner UUID:=gen_random_uuid();
 admin UUID:=gen_random_uuid(); course UUID:=gen_random_uuid(); module UUID:=gen_random_uuid(); activity UUID:=gen_random_uuid();
 result JSONB; replay JSONB; cohort UUID; before_enrolment JSONB; after_enrolment JSONB; before_progress JSONB; page JSONB; batch UUID[];
BEGIN
 INSERT INTO hub_identities(id,external_subject_reference,display_name) VALUES
 (trainer,'cohort-trainer','Trainer'),(learner,'cohort-learner','Learner'),(other_learner,'cohort-other','Other learner'),(admin,'cohort-admin','Admin');
 INSERT INTO hub_role_assignments(identity_id,role_id)
 SELECT i.id,r.id FROM hub_identities i CROSS JOIN hub_roles r WHERE
 (i.id=trainer AND r.code='trainer') OR (i.id IN(learner,other_learner) AND r.code='postulante') OR(i.id=admin AND r.code='admin');
 INSERT INTO hub_courses(id,stable_code,title) VALUES(course,'cohort-fixture','Cohort fixture');
 INSERT INTO hub_modules(id,course_id,stable_code,title,position) VALUES(module,course,'lesson','Lesson',1);
 INSERT INTO hub_activities(id,module_id,stable_code,title,activity_type,position) VALUES(activity,module,'read','Read','article',1);
 INSERT INTO hub_enrolments(identity_id,course_id) VALUES(learner,course);
 PERFORM hub_complete_activity('cohort-learner',activity,'{}','cohort-complete-before');
 SELECT to_jsonb(e) INTO before_enrolment FROM hub_enrolments e WHERE identity_id=learner AND course_id=course;
 SELECT jsonb_agg(to_jsonb(p)) INTO before_progress FROM hub_module_progress p WHERE p.enrolment_id=(before_enrolment->>'id')::uuid;
 result:=hub_save_cohort('cohort-trainer',NULL,'November group',course,'2026-11-30',ARRAY[learner,other_learner],0,'cohort-create');
 cohort:=(result->>'id')::uuid;
 replay:=hub_save_cohort('cohort-trainer',NULL,'November group',course,'2026-11-30',ARRAY[learner,other_learner],0,'cohort-create');
 IF replay<>result OR (SELECT count(*) FROM hub_cohort_members WHERE cohort_id=cohort)<>2 THEN RAISE EXCEPTION 'retry duplicated cohort';END IF;
 SELECT to_jsonb(e) INTO after_enrolment FROM hub_enrolments e WHERE identity_id=learner AND course_id=course;
 IF before_enrolment<>after_enrolment OR before_progress<>(SELECT jsonb_agg(to_jsonb(p)) FROM hub_module_progress p WHERE p.enrolment_id=(before_enrolment->>'id')::uuid) THEN RAISE EXCEPTION 'cohort reset learning';END IF;
 BEGIN
  PERFORM hub_save_cohort('cohort-trainer',NULL,'Different title',course,NULL,ARRAY[learner],0,'cohort-create');
  RAISE EXCEPTION 'retry key accepted changed payload';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_IDEMPOTENCY_CONFLICT' THEN RAISE;END IF;END;
 BEGIN
  PERFORM hub_save_cohort('cohort-learner',NULL,'Forged group',course,NULL,ARRAY[learner],0,'cohort-forged');
  RAISE EXCEPTION 'learner created cohort';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM hub_save_cohort('cohort-admin',NULL,'Wrong role',course,NULL,ARRAY[learner],0,'cohort-admin');
  RAISE EXCEPTION 'admin bypassed existing assignment permissions';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 result:=hub_save_cohort('cohort-trainer',cohort,'December group',course,'2026-12-01',ARRAY[]::uuid[],1,'cohort-revise');
 IF result->>'revision'<>'2' OR (SELECT count(*) FROM hub_cohort_members WHERE cohort_id=cohort)<>2 THEN RAISE EXCEPTION 'edit lost membership';END IF;
 BEGIN
  PERFORM hub_save_cohort('cohort-trainer',cohort,'Stale',course,NULL,ARRAY[]::uuid[],1,'cohort-stale');
  RAISE EXCEPTION 'stale revision accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_REVISION_CONFLICT' THEN RAISE;END IF;END;
 page:=hub_list_cohorts('cohort-learner');
 IF jsonb_array_length(page->'cohorts')<>1 OR page#>>'{cohorts,0,title}'<>'December group'
 OR page#>'{cohorts,0,members}'<>'null'::jsonb THEN RAISE EXCEPTION 'learner projection leaked or missed target';END IF;
 UPDATE hub_enrolments SET status='withdrawn' WHERE identity_id=other_learner AND course_id=course;
 IF jsonb_array_length(hub_list_cohorts('cohort-other')->'cohorts')<>0 THEN RAISE EXCEPTION 'withdrawn learner saw cohort';END IF;
 BEGIN
  PERFORM hub_save_cohort('cohort-trainer',cohort,'Should roll back',course,NULL,ARRAY[other_learner],2,'cohort-withdrawn');
  RAISE EXCEPTION 'withdrawn enrolment silently revived';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ENROLMENT_WITHDRAWN' THEN RAISE;END IF;END;
 IF (SELECT revision FROM hub_cohorts WHERE id=cohort)<>2 OR (SELECT count(*) FROM hub_cohort_events WHERE cohort_id=cohort)<>2 THEN RAISE EXCEPTION 'failed change left partial revision';END IF;
 BEGIN
  PERFORM hub_save_cohort('cohort-trainer',NULL,'Invalid member',course,NULL,ARRAY[learner,admin],0,'cohort-bad-member');
  RAISE EXCEPTION 'non-learner membership accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_OBJECT_NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM hub_cohorts WHERE title='Invalid member') THEN RAISE EXCEPTION 'partial batch persisted';END IF;
 WITH added AS (
  INSERT INTO hub_identities(external_subject_reference,display_name)
  SELECT 'cohort-capacity-'||n,'Capacity learner '||n FROM generate_series(1,99) n RETURNING id
 ) SELECT array_agg(id) INTO batch FROM added;
 INSERT INTO hub_role_assignments(identity_id,role_id) SELECT x,r.id FROM unnest(batch) x CROSS JOIN hub_roles r WHERE r.code='postulante';
 BEGIN
  PERFORM hub_save_cohort('cohort-trainer',cohort,'Too many members',course,NULL,batch,2,'cohort-capacity');
  RAISE EXCEPTION 'cumulative cohort capacity bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_COHORT_CAPACITY' THEN RAISE;END IF;END;
 IF (SELECT count(*) FROM hub_cohort_members WHERE cohort_id=cohort)<>2
 OR EXISTS(SELECT 1 FROM hub_enrolments WHERE identity_id=ANY(batch)) THEN RAISE EXCEPTION 'capacity failure left partial enrolments';END IF;
 IF has_function_privilege('authenticated','hub_save_cohort(text,uuid,text,uuid,date,uuid[],integer,text)','EXECUTE')
 OR has_table_privilege('authenticated','hub_cohort_members','SELECT') THEN RAISE EXCEPTION 'client role bypasses server';END IF;
 INSERT INTO hub_cohorts(title,course_id,created_by) SELECT 'Page fixture '||n,course,trainer FROM generate_series(1,51) n;
 page:=hub_list_cohorts('cohort-trainer');
 IF jsonb_array_length(page->'cohorts')<>50 OR page->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'cohort page silently truncated';END IF;
 replay:=hub_list_cohorts('cohort-trainer',(page->>'nextCursor')::uuid);
 IF jsonb_array_length(replay->'cohorts')<>2 OR replay->>'nextCursor' IS NOT NULL
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(page->'cohorts') a JOIN jsonb_array_elements(replay->'cohorts') b ON a->>'id'=b->>'id')
 THEN RAISE EXCEPTION 'cohort cursor skipped or duplicated records';END IF;
 IF jsonb_array_length(hub_list_cohorts('cohort-learner')->'cohorts')<>1 THEN RAISE EXCEPTION 'foreign cohorts leaked';END IF;
END;$$;
ROLLBACK;
