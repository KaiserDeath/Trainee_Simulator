CREATE FUNCTION public.hub_process_worker_deadlines() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE changed INTEGER;assessments INTEGER;
BEGIN
 assessments:=public.hub_expire_scored_evaluation_attempts();
 UPDATE public.trainee_sessions s SET status='completed',ended_at=clock_timestamp()
 WHERE s.status='active' AND s.runtime_mode='free_simulator' AND EXISTS(SELECT 1 FROM public.hub_simulation_jobs j WHERE j.session_id=s.id AND j.deadline<=now());
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed+assessments;
END; $$;
CREATE FUNCTION public.hub_next_worker_event() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT min(event_at) FROM (
   SELECT least(j.deadline,greatest(j.next_run_at,coalesce(j.lease_until,j.next_run_at))) event_at FROM public.hub_simulation_jobs j
     JOIN public.trainee_sessions s ON s.id=j.session_id AND s.status='active' WHERE j.status IN ('ready','running')
   UNION ALL SELECT j.deadline FROM public.hub_simulation_jobs j JOIN public.trainee_sessions s ON s.id=j.session_id AND s.status='active'
   UNION ALL SELECT expires_at FROM public.hub_scored_evaluation_attempts WHERE status='in_progress'
 ) events;
$$;
REVOKE ALL ON FUNCTION public.hub_process_worker_deadlines(),public.hub_next_worker_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_process_worker_deadlines(),public.hub_next_worker_event() TO service_role;
