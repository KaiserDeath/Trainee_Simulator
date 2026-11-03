-- Return one summary document; operation rows and identifiers stay in Postgres.
CREATE FUNCTION public.trainer_operation_time_stats() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH timed AS MATERIALIZED (
  SELECT o.id,coalesce(nullif(o.type,''),'UNKNOWN') AS type,
    o.handling_time_seconds::double precision AS seconds,
    s.id AS session_id,coalesce(nullif(s.trainee_name,''),'Unknown Trainee') AS trainee_name,s.started_at
  FROM public.sandbox_operations o
  LEFT JOIN public.trainee_sessions s ON s.id=o.session_id
  WHERE o.handling_time_seconds IS NOT NULL
    AND o.handling_time_seconds::text NOT IN ('NaN','Infinity','-Infinity')
    AND abs(o.handling_time_seconds)<=1.7976931348623157e308::numeric
), summaries AS MATERIALIZED (
  SELECT type,session_id,trainee_name,started_at,
    grouping(session_id) AS global_group,grouping(type) AS all_types,min(id::text) AS first_id,
    jsonb_build_object('count',count(*),'totalSeconds',coalesce(sum(seconds ORDER BY id),0),
      'minSeconds',min(seconds),'maxSeconds',max(seconds)) AS stats
  FROM timed
  GROUP BY GROUPING SETS ((),(type),(session_id,trainee_name,started_at),(session_id,trainee_name,started_at,type))
), person_operations AS (
  SELECT coalesce(session_id::text,'') AS session_key,
    jsonb_agg(jsonb_build_object('type',type)||stats ORDER BY type) AS operations
  FROM summaries WHERE global_group=0 AND all_types=0 GROUP BY coalesce(session_id::text,'')
)
SELECT jsonb_build_object(
  'overall',(SELECT stats FROM summaries WHERE global_group=1 AND all_types=1),
  'allOperations',coalesce((SELECT jsonb_agg(jsonb_build_object('type',type)||stats ORDER BY type)
    FROM summaries WHERE global_group=1 AND all_types=0),'[]'::jsonb),
  'perPerson',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'traineeName',a.trainee_name,'sessionId',a.session_id,'startedAt',a.started_at,'overall',a.stats,
    'operations',coalesce(p.operations,'[]'::jsonb)
  ) ORDER BY a.first_id) FROM summaries a
    LEFT JOIN person_operations p ON p.session_key=coalesce(a.session_id::text,'')
    WHERE a.global_group=0 AND a.all_types=1),'[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.trainer_operation_time_stats() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_operation_time_stats() TO service_role;
