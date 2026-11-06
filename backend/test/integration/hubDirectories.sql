DO $$
DECLARE actor UUID:=gen_random_uuid(); learner UUID; course UUID; page JSONB; cursor UUID; total INTEGER:=0; seen UUID[]:='{}'; row JSONB;
BEGIN
 IF has_function_privilege('anon','public.hub_directory_page(TEXT,TEXT,UUID,INTEGER,TEXT,TEXT)','EXECUTE') OR has_function_privilege('authenticated','public.hub_directory_page(TEXT,TEXT,UUID,INTEGER,TEXT,TEXT)','EXECUTE') THEN RAISE EXCEPTION 'Public directory access'; END IF;
 INSERT INTO hub_identities(id,external_subject_reference,display_name) VALUES(actor,actor::text,'Directory audit trainer');
 INSERT INTO hub_role_assignments(identity_id,role_id) SELECT actor,id FROM hub_roles WHERE code='trainer';
 FOR n IN 1..1005 LOOP
  learner:=gen_random_uuid();
  INSERT INTO hub_identities(id,external_subject_reference,display_name,username) VALUES(learner,learner::text,'DirectoryAuditFixture '||n,'Diraudit'||n);
  INSERT INTO hub_role_assignments(identity_id,role_id) SELECT learner,id FROM hub_roles WHERE code='postulante';
 END LOOP;
 LOOP
  page:=hub_directory_page(actor::text,'progress',cursor,100,'DirectoryAuditFixture','active');
  IF (page->>'total')::int<>1005 THEN RAISE EXCEPTION 'Wrong directory total'; END IF;
  FOR row IN SELECT * FROM jsonb_array_elements(page->'rows') LOOP
   IF (row->>'id')::uuid=ANY(seen) THEN RAISE EXCEPTION 'Duplicate directory row'; END IF;
   seen:=array_append(seen,(row->>'id')::uuid);total:=total+1;
   IF row ? 'password' OR row ? 'auth_user_id' THEN RAISE EXCEPTION 'Private directory fields'; END IF;
  END LOOP;
  cursor:=(page->>'nextCursor')::uuid; EXIT WHEN cursor IS NULL;
 END LOOP;
 IF total<>1005 THEN RAISE EXCEPTION 'Incomplete pagination'; END IF;
 BEGIN PERFORM hub_directory_page(learner::text,'progress'); RAISE EXCEPTION 'Learner read directory'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Learner read directory' THEN RAISE; END IF; END;
 BEGIN PERFORM hub_directory_page(actor::text,'accounts'); RAISE EXCEPTION 'Trainer read administrator directory'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Trainer read administrator directory' THEN RAISE; END IF; END;
 page:=hub_directory_page(actor::text,'progress',NULL,10,'DirectoryAuditFixture 1005','active');
 IF jsonb_array_length(page->'rows')<>1 THEN RAISE EXCEPTION 'Search failed'; END IF;
 SELECT id INTO course FROM hub_courses ORDER BY id LIMIT 1;
 INSERT INTO hub_enrolments(identity_id,course_id) VALUES(learner,course);
 page:=hub_directory_page(actor::text,'progress',NULL,10,'DirectoryAuditFixture 1005','active');
 IF jsonb_array_length(page#>'{rows,0,enrolments}')<>1 OR (page#>>'{rows,0,enrolments,0,totalActivities}')::int<=0 OR (page#>>'{rows,0,enrolments,0,completedActivities}')::int<>0 THEN RAISE EXCEPTION 'Summary counts failed'; END IF;
END $$;
