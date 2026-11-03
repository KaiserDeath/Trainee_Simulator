CREATE INDEX hub_scored_report_started_idx ON public.hub_scored_evaluation_attempts(started_at DESC,id);
CREATE FUNCTION public.hub_assessment_report_rows(p_external_subject TEXT,p_learner_id UUID DEFAULT NULL,p_from TIMESTAMPTZ DEFAULT NULL,p_to TIMESTAMPTZ DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result JSONB;
BEGIN
 PERFORM public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh']);
 PERFORM public.hub_expire_assessment_attempts();
 PERFORM public.hub_expire_scored_evaluation_attempts();
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 WITH recent AS MATERIALIZED (
   SELECT * FROM (
     SELECT a.id,a.identity_id,a.started_at,'legacy'::text source,to_jsonb(a) data FROM public.hub_assessment_attempts a
       WHERE (p_learner_id IS NULL OR a.identity_id=p_learner_id) AND (p_from IS NULL OR a.started_at>=p_from) AND (p_to IS NULL OR a.started_at<=p_to)
     UNION ALL
     SELECT a.id,a.identity_id,a.started_at,'governed_evaluation',jsonb_build_object('id',a.id,'identity_id',a.identity_id,'evaluationId',a.evaluation_id,'evaluationTitle',e.title,
       'attempt_number',(s.set_number-1)*s.max_attempts+a.attempt_in_set,'attempt_in_set',a.attempt_in_set,'attemptSetNumber',s.set_number,'formalStatus',a.status,'officialSubmitted',a.status='submitted',
       'status',CASE WHEN a.status='in_progress' THEN 'in_progress' WHEN a.completion_reason='timed_out' THEN 'timed_out' WHEN a.result_status='successful' THEN 'passed' ELSE 'unsuccessful' END,
       'score',a.score,'settings_snapshot',a.settings_snapshot||jsonb_build_object('revision',a.settings_snapshot->'evaluationRevision'),
       'started_at',a.started_at,'expires_at',a.expires_at,'completed_at',a.completed_at,'submitted_at',a.submitted_at)
     FROM public.hub_scored_evaluation_attempts a JOIN public.hub_scored_evaluations e ON e.id=a.evaluation_id JOIN public.hub_evaluation_attempt_sets s ON s.id=a.attempt_set_id
     WHERE (p_learner_id IS NULL OR a.identity_id=p_learner_id) AND (p_from IS NULL OR a.started_at>=p_from) AND (p_to IS NULL OR a.started_at<=p_to)
   ) candidates ORDER BY started_at DESC,id DESC LIMIT 501
 ), selected AS (SELECT * FROM recent ORDER BY started_at DESC,id DESC LIMIT 500), rows AS (
   SELECT r.started_at,r.id,r.data||jsonb_build_object('source',r.source,'postulante',jsonb_build_object('id',i.id,'username',i.username,'display_name',i.display_name),
     'operationResults',CASE WHEN r.source='legacy' THEN coalesce((SELECT jsonb_agg(to_jsonb(operation) ORDER BY created_at,id) FROM public.hub_assessment_operation_results operation WHERE assessment_attempt_id=r.id),'[]'::jsonb)
     ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'operation_type',e.snapshot->>'type','operation_category',CASE WHEN e.snapshot->>'type' IN ('ADD CREDITS','WITHDRAW CREDITS') THEN 'movement' ELSE 'request' END,
       'game',e.snapshot->>'game','status',e.snapshot->>'status','is_correct',e.snapshot->'isCorrect','failure_points',CASE WHEN e.snapshot->'isCorrect'='false'::jsonb THEN '["Recorded Backend decision did not match the operation"]'::jsonb ELSE '[]'::jsonb END,
       'evidenceSource','immutable-operation-snapshot','created_at',e.captured_at) ORDER BY e.captured_at,e.id)
       FROM public.hub_operation_evidence e JOIN public.hub_evaluation_worlds w ON w.session_id=e.session_id WHERE w.attempt_id=r.id),'[]'::jsonb) END) data
   FROM selected r JOIN public.hub_identities i ON i.id=r.identity_id
 )
 SELECT jsonb_build_object('attempts',coalesce(jsonb_agg(data ORDER BY started_at DESC,id DESC),'[]'),'truncated',(SELECT count(*) FROM recent)>500,'scope','500 most recent attempts in the selected learner/date window') INTO result FROM rows;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.hub_assessment_report_rows(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_assessment_report_rows(TEXT,UUID,TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;
