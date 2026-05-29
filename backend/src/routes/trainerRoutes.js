import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

import {
  buildOperationTimeStats,
  buildSessionReport,
  deleteSession,
  deleteSessionsWithoutActivity,
  submitSession
} from '../engine/SessionEngine.js';
import {
  getSessionActionLog,
  logActionEvent
} from '../engine/AuditLogger.js';
import GameMaster from '../engine/GameMaster.js';

const router = Router();

//
// LOG TRAINEE ACTION
//
router.post('/sessions/:id/log-action', async (
  req,
  res
) => {
  const { id: sessionId } = req.params;
  const {
    actionType,
    details = {}
  } = req.body;

  try {
    const session = await getSessionById(sessionId);

    await logActionEvent({
      sessionId,
      traineeName: session.trainee_name,
      operationId: details.operationId || null,
      actionType,
      details
    });

    res.json({
      message: 'Action logged'
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.message
    });
  }
});

const getSessionById = async (sessionId) => {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  return data;
};
router.get('/sessions', async (
  req,
  res
) => {

  try {
    const deletedIds = await deleteSessionsWithoutActivity();
    deletedIds.forEach(id => GameMaster.stopSession(id));
  } catch (cleanupError) {
    console.error('Failed to clean inactive sessions', cleanupError);
  }

  const { data, error } =
    await supabase
      .from('trainee_sessions')
      .select('*')
      .order('started_at', {
        ascending: false
      });

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.json(data);
});

router.get('/operation-time-stats', async (
  req,
  res
) => {
  try {
    const stats =
      await buildOperationTimeStats();

    res.json(stats);
  } catch (err) {
    console.error(err);

    res.status(err.statusCode || 500).json({
      error: err.message
    });
  }
});

router.post('/sessions/:id/time-limit', async (
  req,
  res
) => {
  const { id } = req.params;
  const { minutes } = req.body;

  const parsedMinutes = Number(minutes);

  if (
    !Number.isFinite(parsedMinutes) ||
    parsedMinutes <= 0
  ) {
    return res.status(400).json({
      error:
        'minutes must be a positive number'
    });
  }

  const timeoutMs = Math.round(
    parsedMinutes * 60 * 1000
  );

  const success =
    GameMaster.setSessionTimeout(
      id,
      timeoutMs
    );

  if (!success) {
    return res.status(404).json({
      error:
        'No active session found or session has already stopped'
    });
  }

  res.json({
    message:
      `Session timeout set to ${parsedMinutes} minutes`
  });
});

router.delete('/sessions/:id', async (
  req,
  res
) => {
  const { id } = req.params;

  // STOP GAMEMASTER if the session is still active
  GameMaster.stopSession(id);

  try {
    const session = await deleteSession(id);

    res.json({
      message: 'Session deleted',
      session
    });
  } catch (err) {
    console.error(err);

    res.status(err.statusCode || 500).json({
      error: err.message
    });
  }
});

router.post('/sessions/:id/submit', async (
  req,
  res
) => {
  const { id } = req.params;

  // STOP GAMEMASTER before finalizing submission
  GameMaster.stopSession(id);

  try {
    const session = await submitSession(id);

    res.json({
      message: 'Session submitted for evaluation',
      session
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.message
    });
  }
});

//
// GET SESSION REPORT
//
router.get('/sessions/:id/report', async (
  req,
  res
) => {

  try {

    const report =
      await buildSessionReport(
        req.params.id
      );

    res.json(report);

  } catch (err) {

    if (err.statusCode === 404) {
      console.warn(err.message);
    } else {
      console.error(err);
    }

    res
      .status(err.statusCode || 500)
      .json({
        error: err.message
      });
  }
});

//
// GET SESSION ACTION LOG
//
router.get('/sessions/:id/audit-log', async (
  req,
  res
) => {

  try {

    const auditLog =
      await getSessionActionLog(
        req.params.id
      );

    res.json(auditLog);

  } catch (err) {

    console.error(err);

    res
      .status(err.statusCode || 500)
      .json({
        error: err.message
      });
  }
});

//
// GET SIMULATOR SETTINGS
//
router.get('/settings', async (req, res) => {
  try {
    const { data: timeoutData, error: timeoutErr } = await supabase
      .from('simulator_settings')
      .select('*')
      .eq('key', 'session_timeout_minutes')
      .maybeSingle();

    const { data: minOpmData, error: minOpmErr } = await supabase
      .from('simulator_settings')
      .select('*')
      .eq('key', 'min_opm')
      .maybeSingle();

    const { data: maxOpmData, error: maxOpmErr } = await supabase
      .from('simulator_settings')
      .select('*')
      .eq('key', 'max_opm')
      .maybeSingle();

    if (timeoutErr || minOpmErr || maxOpmErr) {
      console.error('Error fetching settings from database:', timeoutErr || minOpmErr || maxOpmErr);
    }

    res.json({
      sessionTimeoutMinutes: timeoutData ? Number(timeoutData.value) : 30,
      minOpm: minOpmData ? Number(minOpmData.value) : 2,
      maxOpm: maxOpmData ? Number(maxOpmData.value) : 4
    });
  } catch (err) {
    console.error('Unexpected error fetching settings:', err);
    res.json({ sessionTimeoutMinutes: 30, minOpm: 2, maxOpm: 4 });
  }
});

//
// POST SIMULATOR SETTINGS
//
router.post('/settings', async (req, res) => {
  const { sessionTimeoutMinutes, minOpm, maxOpm } = req.body;
  const updates = [];

  if (sessionTimeoutMinutes !== undefined) {
    const minutes = Number(sessionTimeoutMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ error: 'sessionTimeoutMinutes must be a positive number' });
    }
    updates.push({
      key: 'session_timeout_minutes',
      value: minutes,
      updated_at: new Date().toISOString()
    });
  }

  if (minOpm !== undefined) {
    const minVal = Number(minOpm);
    if (!Number.isFinite(minVal) || minVal < 0) {
      return res.status(400).json({ error: 'minOpm must be a non-negative number' });
    }
    updates.push({
      key: 'min_opm',
      value: minVal,
      updated_at: new Date().toISOString()
    });
  }

  if (maxOpm !== undefined) {
    const maxVal = Number(maxOpm);
    if (!Number.isFinite(maxVal) || maxVal < 0) {
      return res.status(400).json({ error: 'maxOpm must be a non-negative number' });
    }
    updates.push({
      key: 'max_opm',
      value: maxVal,
      updated_at: new Date().toISOString()
    });
  }

  if (minOpm !== undefined && maxOpm !== undefined) {
    if (Number(minOpm) > Number(maxOpm)) {
      return res.status(400).json({ error: 'minOpm cannot be greater than maxOpm' });
    }
  }

  try {
    for (const update of updates) {
      const { error } = await supabase
        .from('simulator_settings')
        .upsert(update, { onConflict: 'key' });
      if (error) {
        console.error(`Error saving settings key ${update.key} to database:`, error);
        return res.status(500).json({ error: error.message });
      }
    }

    const { data: timeoutData } = await supabase.from('simulator_settings').select('*').eq('key', 'session_timeout_minutes').maybeSingle();
    const { data: minOpmData } = await supabase.from('simulator_settings').select('*').eq('key', 'min_opm').maybeSingle();
    const { data: maxOpmData } = await supabase.from('simulator_settings').select('*').eq('key', 'max_opm').maybeSingle();

    res.json({
      message: 'Settings saved successfully',
      sessionTimeoutMinutes: timeoutData ? Number(timeoutData.value) : 30,
      minOpm: minOpmData ? Number(minOpmData.value) : 2,
      maxOpm: maxOpmData ? Number(maxOpmData.value) : 4
    });
  } catch (err) {
    console.error('Unexpected error saving settings:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
