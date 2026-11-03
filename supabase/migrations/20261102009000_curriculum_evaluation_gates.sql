-- Display order is not identity. Preserve the original eleven module IDs.
CREATE TABLE public.hub_curriculum_evaluation_gates (
  module_id UUID PRIMARY KEY REFERENCES public.hub_modules(id) ON DELETE RESTRICT,
  evaluation_code TEXT NOT NULL UNIQUE
);
ALTER TABLE public.hub_curriculum_evaluation_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_curriculum_evaluation_gates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_curriculum_evaluation_gates TO service_role;

CREATE FUNCTION public.hub_apply_operator_curriculum() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c UUID:='10000000-0000-4000-8000-000000000001';r RECORD;previous UUID;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.hub_courses WHERE id=c) THEN RETURN; END IF;
  -- Reserve all destination positions before moving existing records.
  UPDATE public.hub_modules SET position=position+1000 WHERE course_id=c
    AND id IN (SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(101,115) n);
  FOR r IN SELECT * FROM (VALUES
    (112,'checkpoint-game-platforms',9,'Checkpoint 1 — Game Platforms'),
    (113,'checkpoint-operations',11,'Checkpoint 2 — Operations'),
    (114,'backend-customer-experience',12,'Backend and Customer Experience'),
    (115,'checkpoint-movements-customer-experience',13,'Checkpoint 3 — Movements and Customer Experience')
  ) entries(suffix,code,position,title) LOOP
    INSERT INTO public.hub_modules(id,course_id,stable_code,position,title,summary,is_scored)
    VALUES(('10000000-0000-4000-8000-'||lpad(r.suffix::text,12,'0'))::uuid,c,r.code,r.position,r.title,
      CASE WHEN r.suffix=114 THEN 'Customer records, company and licensed access, Backend history, clear evidence-based communication and escalation.' ELSE 'Complete and officially submit the assigned assessment with a successful result.' END,r.suffix<>114)
    ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position;
  END LOOP;
  UPDATE public.hub_modules SET position=CASE
    WHEN right(id::text,3)::integer BETWEEN 101 AND 108 THEN right(id::text,3)::integer-100
    WHEN right(id::text,3)::integer=109 THEN 10
    WHEN right(id::text,3)::integer=110 THEN 14
    ELSE 15 END
  WHERE course_id=c AND id IN (SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(101,111) n);
  INSERT INTO public.hub_curriculum_evaluation_gates(module_id,evaluation_code) VALUES
    ('10000000-0000-4000-8000-000000000112','checkpoint-game-platforms'),
    ('10000000-0000-4000-8000-000000000113','checkpoint-operations'),
    ('10000000-0000-4000-8000-000000000115','checkpoint-movements-customer-experience'),
    ('10000000-0000-4000-8000-000000000111','final-pretraining-readiness')
  ON CONFLICT(module_id) DO NOTHING;
  INSERT INTO public.hub_activities(module_id,stable_code,position,activity_type,title,content,is_scored)
  SELECT g.module_id,'official-evaluation-result',1,'assessment',m.title,
    jsonb_build_object('executionKind','official_evaluation','evaluationCode',g.evaluation_code),TRUE
  FROM public.hub_curriculum_evaluation_gates g JOIN public.hub_modules m ON m.id=g.module_id
  WHERE NOT EXISTS(SELECT 1 FROM public.hub_activities a WHERE a.module_id=g.module_id)
  ON CONFLICT(module_id,stable_code) DO NOTHING;
  UPDATE public.hub_activities SET content=(content-'blockedReason')||'{"policyStatus":"approved","executionKind":"official_evaluation","evaluationCode":"final-pretraining-readiness"}'::jsonb
    WHERE module_id='10000000-0000-4000-8000-000000000111' AND stable_code='final-assessment-policy-gated';
  INSERT INTO public.hub_activities(module_id,stable_code,position,activity_type,title,content)
  VALUES('10000000-0000-4000-8000-000000000114','backend-customer-evidence',1,'article','Use Backend evidence to explain a customer outcome',
    '{"paragraphs":["Confirm the assigned company and licensed access before opening the exact customer record. Check the request, player and relevant game and Backend histories before changing an account or balance.","Explain the recorded outcome using the verified request and movement evidence. Separate the customer balance from game credit and the loading wallet. Never claim that a missing or uncertain movement succeeded.","When histories disagree, preserve the evidence and use the approved reconciliation, cancellation or escalation workflow. Do not repeat an already recorded game movement. Keep passwords and credentials out of ordinary reports and customer notes."]}')
  ON CONFLICT(module_id,stable_code) DO NOTHING;
  -- Replace only edges inside this baseline. Preserve custom prerequisite edges.
  DELETE FROM public.hub_module_prerequisites p WHERE p.course_id=c
    AND p.module_id IN (SELECT module_id FROM public.hub_curriculum_evaluation_gates UNION SELECT id FROM public.hub_modules WHERE course_id=c AND position BETWEEN 1 AND 15)
    AND p.prerequisite_module_id IN (SELECT id FROM public.hub_modules WHERE course_id=c AND position BETWEEN 1 AND 15);
  previous:=NULL;
  FOR r IN SELECT id FROM public.hub_modules WHERE course_id=c AND position BETWEEN 1 AND 15 ORDER BY position LOOP
    IF previous IS NOT NULL THEN INSERT INTO public.hub_module_prerequisites(course_id,module_id,prerequisite_module_id) VALUES(c,r.id,previous) ON CONFLICT DO NOTHING; END IF;
    previous:=r.id;
  END LOOP;
  -- Published historical policies stay immutable. Draft prerequisites follow the approved map.
  UPDATE public.hub_scored_evaluations e SET prerequisite_module_ids=ARRAY(
    SELECT m.id FROM public.hub_modules m WHERE m.course_id=c AND m.position<CASE e.position WHEN 1 THEN 9 WHEN 2 THEN 11 WHEN 3 THEN 13 ELSE 15 END ORDER BY m.position
  ) WHERE e.publication_status='draft';
END; $$;
SELECT public.hub_apply_operator_curriculum();
REVOKE ALL ON FUNCTION public.hub_apply_operator_curriculum() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hub_guard_official_module_completion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.status='completed' AND EXISTS(SELECT 1 FROM public.hub_curriculum_evaluation_gates WHERE module_id=NEW.module_id)
    AND NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts a
      JOIN public.hub_scored_evaluations e ON e.id=a.evaluation_id
      JOIN public.hub_curriculum_evaluation_gates g ON g.evaluation_code=e.stable_code AND g.module_id=NEW.module_id
      JOIN public.hub_enrolments enrol ON enrol.id=NEW.enrolment_id AND enrol.identity_id=a.identity_id
      WHERE a.status='submitted' AND a.result_status='successful' AND a.score=100)
  THEN RAISE EXCEPTION 'HUB_OFFICIAL_EVALUATION_REQUIRED'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_official_module_completion BEFORE INSERT OR UPDATE ON public.hub_module_progress
FOR EACH ROW EXECUTE FUNCTION public.hub_guard_official_module_completion();

CREATE FUNCTION public.hub_apply_official_evaluation_progress() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.status='submitted' AND NEW.result_status='successful' AND NEW.score=100 THEN
    INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at)
    SELECT enrol.id,enrol.course_id,g.module_id,'completed',NEW.started_at,coalesce(NEW.submitted_at,now())
    FROM public.hub_curriculum_evaluation_gates g JOIN public.hub_scored_evaluations e ON e.stable_code=g.evaluation_code AND e.id=NEW.evaluation_id
      JOIN public.hub_modules m ON m.id=g.module_id JOIN public.hub_enrolments enrol ON enrol.course_id=m.course_id
    WHERE enrol.identity_id=NEW.identity_id AND enrol.status<>'withdrawn'
    ON CONFLICT(enrolment_id,module_id) DO UPDATE SET status='completed',started_at=coalesce(hub_module_progress.started_at,EXCLUDED.started_at),completed_at=coalesce(hub_module_progress.completed_at,EXCLUDED.completed_at),updated_at=now();
    UPDATE public.hub_enrolments enrol SET status='completed',started_at=coalesce(started_at,NEW.started_at),completed_at=coalesce(completed_at,now()),updated_at=now()
    WHERE enrol.identity_id=NEW.identity_id AND enrol.status<>'withdrawn' AND EXISTS(SELECT 1 FROM public.hub_modules m WHERE m.course_id=enrol.course_id)
      AND NOT EXISTS(SELECT 1 FROM public.hub_modules m WHERE m.course_id=enrol.course_id AND m.publication_status<>'archived'
        AND NOT EXISTS(SELECT 1 FROM public.hub_module_progress p WHERE p.enrolment_id=enrol.id AND p.module_id=m.id AND p.status='completed'));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_official_evaluation_progress AFTER INSERT OR UPDATE ON public.hub_scored_evaluation_attempts
FOR EACH ROW EXECUTE FUNCTION public.hub_apply_official_evaluation_progress();
REVOKE ALL ON FUNCTION public.hub_guard_official_module_completion(),public.hub_apply_official_evaluation_progress() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.hub_readiness_summary() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('readyPostulantes',count(DISTINCT enrol.identity_id))
  FROM public.hub_enrolments enrol JOIN public.hub_scored_evaluations final ON final.stable_code='final-pretraining-readiness'
  WHERE enrol.status<>'withdrawn' AND cardinality(final.prerequisite_module_ids)>0
    AND NOT EXISTS(SELECT 1 FROM unnest(final.prerequisite_module_ids) required_module
      WHERE NOT EXISTS(SELECT 1 FROM public.hub_module_progress p WHERE p.enrolment_id=enrol.id AND p.module_id=required_module AND p.status='completed'))
    AND NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluations checkpoint WHERE checkpoint.evaluation_type='checkpoint'
      AND NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts a WHERE a.identity_id=enrol.identity_id AND a.evaluation_id=checkpoint.id AND a.status='submitted' AND a.score=100 AND a.result_status='successful'));
$$;
REVOKE ALL ON FUNCTION public.hub_readiness_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_readiness_summary() TO service_role;
