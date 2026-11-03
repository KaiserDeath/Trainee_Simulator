-- Cohorts assign existing course enrolments; target dates never close learning or formal attempts.
CREATE TABLE public.hub_cohorts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 course_id UUID NOT NULL REFERENCES public.hub_courses(id),
 due_on DATE, revision INTEGER NOT NULL DEFAULT 1,
 created_by UUID NOT NULL REFERENCES public.hub_identities(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.hub_cohort_members (
 cohort_id UUID NOT NULL REFERENCES public.hub_cohorts(id),
 enrolment_id UUID NOT NULL REFERENCES public.hub_enrolments(id),
 PRIMARY KEY(cohort_id,enrolment_id)
);
CREATE INDEX hub_cohort_members_enrolment_idx ON public.hub_cohort_members(enrolment_id);
CREATE TABLE public.hub_cohort_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),cohort_id UUID NOT NULL REFERENCES public.hub_cohorts(id),
 actor_id UUID NOT NULL REFERENCES public.hub_identities(id),
 revision INTEGER NOT NULL, details JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cohort_id,revision)
);
CREATE TRIGGER hub_cohort_events_immutable BEFORE UPDATE OR DELETE ON public.hub_cohort_events
 FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE FUNCTION public.hub_save_cohort(p_external_subject TEXT,p_cohort_id UUID,p_title TEXT,p_course_id UUID,
 p_due_on DATE,p_learner_ids UUID[],p_expected_revision INTEGER,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID; cohort public.hub_cohorts%ROWTYPE; claim public.hub_idempotency_keys%ROWTYPE;
 fingerprint TEXT; learner UUID; enrolment UUID; response JSONB;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh']);
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200 OR p_course_id IS NULL
 OR p_expected_revision IS NULL OR p_expected_revision<0
 OR length(coalesce(p_idempotency_key,'')) NOT BETWEEN 1 AND 200
 OR p_learner_ids IS NULL OR cardinality(p_learner_ids)>100
 OR array_position(p_learner_ids,NULL) IS NOT NULL
 OR (p_due_on IS NOT NULL AND (NOT isfinite(p_due_on) OR p_due_on<'2000-01-01' OR p_due_on>'2100-12-31'))
 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('id',p_cohort_id,'title',p_title,'course',p_course_id,
 'due',p_due_on,'learners',p_learner_ids,'revision',p_expected_revision)::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint)
 VALUES(actor,'save_cohort',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=actor AND action_code='save_cohort'
 AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
 IF p_cohort_id IS NULL THEN
   IF p_expected_revision<>0 OR cardinality(p_learner_ids)=0 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.hub_courses WHERE id=p_course_id AND publication_status<>'archived') THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   INSERT INTO public.hub_cohorts(title,course_id,due_on,created_by)
   VALUES(btrim(p_title),p_course_id,p_due_on,actor) RETURNING * INTO cohort;
 ELSE
   SELECT * INTO cohort FROM public.hub_cohorts WHERE id=p_cohort_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   IF cohort.revision<>p_expected_revision THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT';END IF;
   IF cohort.course_id<>p_course_id THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
   UPDATE public.hub_cohorts SET title=btrim(p_title),due_on=p_due_on,revision=revision+1 WHERE id=cohort.id RETURNING * INTO cohort;
 END IF;
 -- Stable order avoids reversed overlapping batches acquiring enrolment locks in different orders.
 FOR learner IN SELECT DISTINCT x FROM unnest(p_learner_ids) x ORDER BY x LOOP
   PERFORM 1 FROM public.hub_identities i JOIN public.hub_role_assignments a ON a.identity_id=i.id
   JOIN public.hub_roles r ON r.id=a.role_id WHERE i.id=learner AND i.status='active' AND r.code='postulante' FOR SHARE OF i,a;
   IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   INSERT INTO public.hub_enrolments(identity_id,course_id,assigned_by_identity_id)
   VALUES(learner,cohort.course_id,actor) ON CONFLICT(identity_id,course_id) DO NOTHING;
   SELECT id INTO enrolment FROM public.hub_enrolments WHERE identity_id=learner AND course_id=cohort.course_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.hub_enrolments WHERE id=enrolment AND status='withdrawn') THEN RAISE EXCEPTION 'HUB_ENROLMENT_WITHDRAWN';END IF;
   INSERT INTO public.hub_cohort_members(cohort_id,enrolment_id) VALUES(cohort.id,enrolment) ON CONFLICT DO NOTHING;
 END LOOP;
 IF (SELECT count(*) FROM public.hub_cohort_members WHERE cohort_id=cohort.id)>100 THEN RAISE EXCEPTION 'HUB_COHORT_CAPACITY';END IF;
 INSERT INTO public.hub_cohort_events(cohort_id,actor_id,revision,details) VALUES(cohort.id,actor,cohort.revision,
 jsonb_build_object('title',cohort.title,'dueOn',cohort.due_on,'addedLearnerIds',p_learner_ids));
 response:=to_jsonb(cohort);
 UPDATE public.hub_idempotency_keys k SET response=to_jsonb(cohort)
 WHERE k.identity_id=actor AND k.action_code='save_cohort' AND k.idempotency_key=p_idempotency_key;
 RETURN response;
END;$$;

CREATE FUNCTION public.hub_list_cohorts(p_external_subject TEXT,p_after UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID; staff BOOLEAN; rows JSONB; next_cursor UUID;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh','postulante']);
 staff:=EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=actor AND r.code IN ('trainer','rrhh'));
 WITH page AS (
  SELECT c.* FROM public.hub_cohorts c WHERE (p_after IS NULL OR c.id>p_after) AND (staff OR EXISTS(
   SELECT 1 FROM public.hub_cohort_members cm JOIN public.hub_enrolments e ON e.id=cm.enrolment_id
   WHERE cm.cohort_id=c.id AND e.identity_id=actor AND e.status<>'withdrawn')) ORDER BY c.id LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY id LIMIT 50)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'courseId',c.course_id,'courseTitle',course.title,
 'dueOn',c.due_on,'revision',c.revision,'members',CASE WHEN staff THEN (
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.identity_id,'displayName',i.display_name,'status',e.status) ORDER BY i.display_name,e.identity_id),'[]')
 FROM public.hub_cohort_members cm JOIN public.hub_enrolments e ON e.id=cm.enrolment_id JOIN public.hub_identities i ON i.id=e.identity_id WHERE cm.cohort_id=c.id
 ) ELSE NULL END) ORDER BY c.id),'[]'),
 CASE WHEN (SELECT count(*) FROM page)>50 THEN (SELECT id FROM visible ORDER BY id DESC LIMIT 1) ELSE NULL END
 INTO rows,next_cursor FROM visible c JOIN public.hub_courses course ON course.id=c.course_id;
 RETURN jsonb_build_object('cohorts',rows,'nextCursor',next_cursor);
END;$$;
ALTER TABLE public.hub_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_cohort_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_cohorts,public.hub_cohort_members,public.hub_cohort_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hub_save_cohort(TEXT,UUID,TEXT,UUID,DATE,UUID[],INTEGER,TEXT),public.hub_list_cohorts(TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_save_cohort(TEXT,UUID,TEXT,UUID,DATE,UUID[],INTEGER,TEXT),public.hub_list_cohorts(TEXT,UUID) TO service_role;
