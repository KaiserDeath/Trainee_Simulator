// Rebuild in-memory generation timers from persisted session deadlines.
export async function recoverActiveSessions({ db, gameMaster, completeSession, now = Date.now() }) {
  const { data: sessions, error } = await db
    .from('trainee_sessions')
    .select('id,started_at,duration_minutes')
    .eq('status', 'active');
  if (error) throw error;

  const activeIds = new Set(sessions.map(session => session.id));
  for (const id of gameMaster.activeSessions.keys()) {
    if (!activeIds.has(id)) gameMaster.stopSession(id);
  }

  for (const session of sessions) {
    const minutes = Number(session.duration_minutes);
    const duration = Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : gameMaster.autoCloseMs;
    const remaining = Date.parse(session.started_at) + duration - now;
    if (!Number.isFinite(remaining)) {
      console.error(`Cannot recover session ${session.id}: invalid started_at`);
      continue;
    }
    if (remaining <= 0) {
      gameMaster.stopSession(session.id);
      await completeSession(session.id);
    } else if (!gameMaster.activeSessions.has(session.id)) {
      await gameMaster.startSession(session.id, remaining);
    }
  }
}
