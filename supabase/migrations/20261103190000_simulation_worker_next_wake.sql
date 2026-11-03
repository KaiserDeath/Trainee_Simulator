-- Preserve newer assessment/deadline scheduling when it is installed, while
-- retaining standalone simulator compatibility for a fresh main-branch schema.
CREATE FUNCTION public.hub_prepare_simulation_poll() RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_next TIMESTAMPTZ;
BEGIN
  IF to_regprocedure('public.hub_process_worker_deadlines()') IS NOT NULL THEN
    PERFORM public.hub_process_worker_deadlines();
  ELSE
    UPDATE public.trainee_sessions s SET status='completed',ended_at=clock_timestamp()
    WHERE s.status='active' AND s.runtime_mode='free_simulator'
      AND EXISTS(SELECT 1 FROM public.hub_simulation_jobs j WHERE j.session_id=s.id AND j.deadline<=now());
  END IF;
  IF to_regprocedure('public.hub_next_worker_event()') IS NOT NULL THEN
    RETURN public.hub_next_worker_event();
  END IF;
  SELECT min(event_at) INTO v_next FROM (
    SELECT least(j.deadline,greatest(j.next_run_at,coalesce(j.lease_until,j.next_run_at))) AS event_at
    FROM public.hub_simulation_jobs j JOIN public.trainee_sessions s ON s.id=j.session_id AND s.status='active'
    WHERE j.status IN ('ready','running')
    UNION ALL
    SELECT j.deadline FROM public.hub_simulation_jobs j
    JOIN public.trainee_sessions s ON s.id=j.session_id AND s.status='active'
  ) events;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.hub_prepare_simulation_poll() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_prepare_simulation_poll() TO service_role;
