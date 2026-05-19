import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

import {
  buildSessionReport,
  deleteSession,
  deleteSessionsWithoutActivity,
  submitSession
} from '../engine/SessionEngine.js';
import {
  getSessionActionLog
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

    console.error(err);

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

export default router;
