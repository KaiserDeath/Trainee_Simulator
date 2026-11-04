-- Read-only review packet. No publication, identities or answer keys exported.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'generatedAt',now(),
 'modules',(SELECT jsonb_agg(jsonb_build_object('code',m.stable_code,'position',m.position,'title',m.title,
   'publicationStatus',m.publication_status,'provisional',m.is_provisional,'activities',
   (SELECT jsonb_agg(jsonb_build_object('code',a.stable_code,'title',a.title,'type',a.activity_type) ORDER BY a.position) FROM hub_activities a WHERE a.module_id=m.id)) ORDER BY m.position) FROM hub_modules m),
 'evaluations',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.stable_code,'title',p.title,
   'revision',p.revision,'publicationStatus',p.publication_status,'passScore',p.pass_score,
   'maxAttemptsPerSet',p.max_attempts_per_set,'durationMinutes',p.duration_minutes,
   'theoryWeight',p.theory_weight,'practicalWeight',p.practical_weight,
   'requiredActions',p.required_action_codes,'theoryItemCodes',p.theory_item_codes,
   'prerequisiteModuleIds',p.prerequisite_module_ids,'prerequisiteEvaluationIds',p.prerequisite_evaluation_ids,
   'currentPolicyDigest',md5(to_jsonb(p)::text),
   'candidateFamilyKeys',ARRAY['orion-stars'],
   'candidatePassesCanonicalValidator',(hub_validate_evaluation_policy(jsonb_populate_record(p,
     '{"publication_status":"published","is_provisional":false,"selected_game_family_keys":["orion-stars"]}'::jsonb))).publication_status='published'
 ) ORDER BY p.position) FROM hub_list_effective_evaluations() p)
) AS review_packet;
ROLLBACK;
