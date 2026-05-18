import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

import {
  buildSessionReport,
  deleteSession,
  deleteSessionsWithoutActivity
} from '../engine/SessionEngine.js';
import GameMaster from '../engine/GameMaster.js';

const router = Router();

//
// GET ALL SESSIONS
//
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

export default router;
