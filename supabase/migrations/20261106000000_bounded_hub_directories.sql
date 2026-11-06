-- One bounded summary read. Never fetch lesson bodies, credentials or attempt evidence for a directory.
CREATE FUNCTION public.hub_directory_page(p_external_subject TEXT, p_kind TEXT,
 p_cursor UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_search TEXT DEFAULT '', p_status TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result JSONB;
BEGIN
 IF p_kind='accounts' THEN
  PERFORM public.hub_require_active_role(p_external_subject,ARRAY['admin']);
 ELSIF p_kind IN ('learners','progress') THEN
  PERFORM public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh']);
 ELSE RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR length(p_search)>120 OR p_status NOT IN ('','active','deactivated') THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
 WITH matched AS MATERIALIZED (
  SELECT i.* FROM public.hub_identities i
  WHERE (p_kind='accounts' OR EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=i.id AND r.code='postulante'))
   AND (p_kind<>'progress' OR i.status='active')
   AND (p_status='' OR i.status=p_status)
   AND (coalesce(p_search,'')='' OR strpos(lower(i.display_name||' '||coalesce(i.username,'')),lower(p_search))>0)
 ), candidates AS MATERIALIZED (
  SELECT * FROM matched WHERE p_cursor IS NULL OR id>p_cursor ORDER BY id LIMIT p_limit+1
 ), selected AS MATERIALIZED (SELECT * FROM candidates ORDER BY id LIMIT p_limit), rows AS (
  SELECT i.id,jsonb_build_object('id',i.id,'username',i.username,'displayName',i.display_name,'firstName',i.first_name,'surname',i.surname,'preferredLocale',i.preferred_locale,'status',i.status,
   'roles',(SELECT coalesce(jsonb_agg(upper(r.code) ORDER BY r.code),'[]') FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=i.id))
   ||CASE WHEN p_kind='progress' THEN jsonb_build_object('enrolments',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'course',jsonb_build_object('id',c.id,'title',c.title),
     'totalActivities',(SELECT count(*) FROM public.hub_modules m JOIN public.hub_activities a ON a.module_id=m.id WHERE m.course_id=e.course_id),
     'completedActivities',(SELECT count(*) FROM public.hub_modules m JOIN public.hub_activities a ON a.module_id=m.id
      JOIN public.hub_module_progress mp ON mp.module_id=m.id AND mp.enrolment_id=e.id
      JOIN LATERAL (SELECT t.id FROM public.hub_attempts t WHERE t.module_progress_id=mp.id ORDER BY t.attempt_number DESC LIMIT 1) latest ON true
      JOIN public.hub_activity_attempts aa ON aa.attempt_id=latest.id AND aa.activity_id=a.id AND aa.status='completed'
      WHERE m.course_id=e.course_id)) ORDER BY e.assigned_at,e.id)
    FROM public.hub_enrolments e JOIN public.hub_courses c ON c.id=e.course_id WHERE e.identity_id=i.id),'[]')) ELSE '{}'::jsonb END data
  FROM selected i
 ) SELECT jsonb_build_object('rows',coalesce(jsonb_agg(data ORDER BY id),'[]'),
  'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>p_limit THEN (SELECT id FROM selected ORDER BY id DESC LIMIT 1) ELSE NULL END,
  'total',(SELECT count(*) FROM matched),'retrievedAt',statement_timestamp(),'scope','matching directory records; cursor pages are live reads') INTO result FROM rows;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.hub_directory_page(TEXT,TEXT,UUID,INTEGER,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_directory_page(TEXT,TEXT,UUID,INTEGER,TEXT,TEXT) TO service_role;

CREATE FUNCTION public.hub_runtime_queue_health(p_external_subject TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.hub_require_active_role(p_external_subject,ARRAY['admin']);
 RETURN (SELECT jsonb_build_object('ready',count(*) FILTER(WHERE status='ready'),
  'running',count(*) FILTER(WHERE status='running'),'dead',count(*) FILTER(WHERE status='dead'),
  'expiredLeases',count(*) FILTER(WHERE status='running' AND lease_until<now()),
  'oldestDueSeconds',coalesce(max(greatest(0,extract(epoch FROM now()-next_run_at))) FILTER(WHERE status='ready'),0),
  'retrievedAt',statement_timestamp()) FROM public.hub_simulation_jobs WHERE status<>'completed');
END; $$;
REVOKE ALL ON FUNCTION public.hub_runtime_queue_health(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_runtime_queue_health(TEXT) TO service_role;
