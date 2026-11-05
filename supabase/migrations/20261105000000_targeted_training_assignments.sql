-- Targeted training is separate from enrollment, course completion and formal results.
CREATE TABLE public.hub_training_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id UUID NOT NULL REFERENCES public.hub_identities(id),
 module_id UUID NOT NULL REFERENCES public.hub_modules(id),
 assigned_by UUID NOT NULL REFERENCES public.hub_identities(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('onboarding','reinforcement')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
 due_on DATE,
 status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','acknowledged','verified','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 verification_attempt_id UUID REFERENCES public.hub_attempts(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(status<>'verified' OR verification_attempt_id IS NOT NULL)
);
CREATE INDEX hub_training_assignments_learner_idx ON public.hub_training_assignments(learner_id,id);
CREATE TABLE public.hub_training_assignment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id UUID NOT NULL REFERENCES public.hub_training_assignments(id),
 actor_id UUID NOT NULL REFERENCES public.hub_identities(id),
 revision INTEGER NOT NULL,
 command TEXT NOT NULL,
 reason TEXT NOT NULL,
 verification_attempt_id UUID REFERENCES public.hub_attempts(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(assignment_id,revision)
);
CREATE TRIGGER hub_training_assignment_events_immutable BEFORE UPDATE OR DELETE
 ON public.hub_training_assignment_events FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.hub_training_assignment_command(
 p_external_subject TEXT,p_command TEXT,p_assignment_id UUID,p_learner_id UUID,p_module_id UUID,
 p_purpose TEXT,p_reason TEXT,p_due_on DATE,p_expected_revision INTEGER,
 p_verification_attempt_id UUID,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;v_row public.hub_training_assignments%ROWTYPE;
 v_claim public.hub_idempotency_keys%ROWTYPE;v_fingerprint TEXT;v_response JSONB;
BEGIN
 v_actor:=public.hub_require_active_role(p_external_subject,
  CASE WHEN p_command='acknowledge' THEN ARRAY['postulante'] ELSE ARRAY['trainer'] END);
 IF p_command<>'acknowledge' AND EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id
  WHERE a.identity_id=v_actor AND r.code='postulante') THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 IF p_command IS NULL OR p_command NOT IN ('assign','acknowledge','verify','cancel')
 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000
 OR p_expected_revision IS NULL OR p_expected_revision<0
 OR length(coalesce(p_idempotency_key,'')) NOT BETWEEN 1 AND 200
 OR (p_due_on IS NOT NULL AND (NOT isfinite(p_due_on) OR p_due_on<'2000-01-01' OR p_due_on>'2100-12-31'))
 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 v_fingerprint:=encode(extensions.digest(jsonb_build_object('command',p_command,'id',p_assignment_id,
  'learner',p_learner_id,'module',p_module_id,'purpose',p_purpose,'reason',p_reason,'due',p_due_on,
  'revision',p_expected_revision,'evidence',p_verification_attempt_id)::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint)
 VALUES(v_actor,'training_assignment',p_idempotency_key,v_fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO v_claim FROM public.hub_idempotency_keys WHERE identity_id=v_actor
 AND action_code='training_assignment' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF v_claim.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF v_claim.response IS NOT NULL THEN RETURN v_claim.response;END IF;
 IF p_command='assign' THEN
  IF p_assignment_id IS NOT NULL OR p_expected_revision<>0 OR p_purpose IS NULL
   OR p_purpose NOT IN ('onboarding','reinforcement') OR p_verification_attempt_id IS NOT NULL
   THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_modules m JOIN public.hub_enrolments e ON e.course_id=m.course_id
   JOIN public.hub_identities i ON i.id=e.identity_id
   JOIN public.hub_role_assignments a ON a.identity_id=i.id JOIN public.hub_roles r ON r.id=a.role_id
   WHERE m.id=p_module_id AND e.identity_id=p_learner_id AND e.status<>'withdrawn'
   AND i.status='active' AND r.code='postulante') THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
  INSERT INTO public.hub_training_assignments(learner_id,module_id,assigned_by,purpose,reason,due_on)
  VALUES(p_learner_id,p_module_id,v_actor,p_purpose,btrim(p_reason),p_due_on) RETURNING * INTO v_row;
 ELSE
  SELECT * INTO v_row FROM public.hub_training_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
  IF p_command='acknowledge' AND v_actor<>v_row.learner_id THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
  IF p_learner_id IS NOT NULL OR p_module_id IS NOT NULL OR p_purpose IS NOT NULL OR p_due_on IS NOT NULL
   THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  IF v_row.revision<>p_expected_revision THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT';END IF;
  IF v_row.status IN ('verified','cancelled') OR (p_command='acknowledge' AND v_row.status<>'assigned')
   THEN RAISE EXCEPTION 'HUB_ASSIGNMENT_CLOSED';END IF;
  IF p_command='verify' THEN
   IF NOT EXISTS(SELECT 1 FROM public.hub_attempts a
    JOIN public.hub_module_progress p ON p.id=a.module_progress_id JOIN public.hub_enrolments e ON e.id=p.enrolment_id
    WHERE a.id=p_verification_attempt_id AND e.identity_id=v_row.learner_id AND a.module_id=v_row.module_id
    AND a.status='completed' AND a.completed_at>v_row.created_at)
    THEN RAISE EXCEPTION 'HUB_VERIFICATION_EVIDENCE_REQUIRED';END IF;
  ELSIF p_verification_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  UPDATE public.hub_training_assignments SET
   status=CASE p_command WHEN 'verify' THEN 'verified' WHEN 'cancel' THEN 'cancelled' ELSE 'acknowledged' END,
   revision=revision+1,verification_attempt_id=p_verification_attempt_id,updated_at=clock_timestamp()
   WHERE id=v_row.id RETURNING * INTO v_row;
 END IF;
 INSERT INTO public.hub_training_assignment_events(assignment_id,actor_id,revision,command,reason,verification_attempt_id)
 VALUES(v_row.id,v_actor,v_row.revision,p_command,btrim(p_reason),p_verification_attempt_id);
 v_response:=to_jsonb(v_row);
 UPDATE public.hub_idempotency_keys SET response=v_response
 WHERE identity_id=v_actor AND action_code='training_assignment' AND idempotency_key=p_idempotency_key;
 RETURN v_response;
END;$$;

CREATE OR REPLACE FUNCTION public.hub_list_training_assignments(p_external_subject TEXT,p_learner_id UUID,p_after UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;v_learner UUID;v_staff BOOLEAN;v_rows JSONB;v_next UUID;v_modules JSONB;
BEGIN
 v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh','postulante']);
 -- Learner identities cannot obtain staff visibility by adding another role.
 v_staff:=NOT EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id
  WHERE a.identity_id=v_actor AND r.code='postulante');
 IF NOT v_staff AND p_learner_id IS NOT NULL AND p_learner_id<>v_actor THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 v_learner:=CASE WHEN v_staff THEN p_learner_id ELSE v_actor END;
 IF v_learner IS NULL THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 WITH page AS (
  SELECT a.* FROM public.hub_training_assignments a WHERE a.learner_id=v_learner
  AND (p_after IS NULL OR a.id>p_after) ORDER BY a.id LIMIT 51
 ), visible AS(SELECT * FROM page ORDER BY id LIMIT 50)
 SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('moduleTitle',m.title,'courseId',m.course_id,
  'courseTitle',c.title) ORDER BY a.id),'[]'),
  CASE WHEN (SELECT count(*) FROM page)>50 THEN (SELECT id FROM visible ORDER BY id DESC LIMIT 1) ELSE NULL END
 INTO v_rows,v_next FROM visible a JOIN public.hub_modules m ON m.id=a.module_id JOIN public.hub_courses c ON c.id=m.course_id;
 IF v_staff THEN
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m."courseTitle",m.position,m.id),'[]') INTO v_modules FROM (
   SELECT m.id,m.title,m.position,c.title AS "courseTitle" FROM public.hub_modules m JOIN public.hub_courses c ON c.id=m.course_id
   WHERE EXISTS(SELECT 1 FROM public.hub_enrolments e WHERE e.identity_id=v_learner AND e.course_id=m.course_id AND e.status<>'withdrawn')
   ORDER BY c.title,m.position,m.id LIMIT 200
  ) m;
 END IF;
 RETURN jsonb_build_object('assignments',v_rows,'nextCursor',v_next,'moduleOptions',coalesce(v_modules,'[]'));
END;$$;

ALTER TABLE public.hub_training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_training_assignment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_training_assignments,public.hub_training_assignment_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hub_training_assignment_command(TEXT,TEXT,UUID,UUID,UUID,TEXT,TEXT,DATE,INTEGER,UUID,TEXT),
 public.hub_list_training_assignments(TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_training_assignment_command(TEXT,TEXT,UUID,UUID,UUID,TEXT,TEXT,DATE,INTEGER,UUID,TEXT),
 public.hub_list_training_assignments(TEXT,UUID,UUID) TO service_role;
