import { Router } from 'express';

import { supabase } from '../config/supabase.js';

import { createSandboxSession }
  from '../services/sandboxService.js';

import GameMaster
  from '../engine/GameMaster.js';
import {
  completeSession,
  deleteSession,
  deleteSessionsWithoutActivity
} from '../engine/SessionEngine.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const deletedIds = await deleteSessionsWithoutActivity();
    deletedIds.forEach(id => GameMaster.stopSession(id));
  } catch (cleanupError) {
    console.error('Failed to clean inactive sessions', cleanupError);
  }

  const { data, error } = await supabase
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

router.post('/start', async (req, res) => {
  try {
    const { traineeName } = req.body;

    if (!traineeName) {
      return res.status(400).json({
        error:
          'traineeName is required'
      });
    }

    const session =
      await createSandboxSession(
        traineeName
      );

    // START GAMEMASTER
    await GameMaster.startSession(
      session.id
    );

    res.json({
      message:
        'Sandbox session created',
      session
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

router.post('/:id/stop', async (req, res) => {
  const { id } = req.params;

  // STOP GAMEMASTER
  GameMaster.stopSession(id);

  try {
    const session =
      await completeSession(id);

    res.json({
      message: 'Session ended',
      session
    });
  } catch (err) {
    console.error(err);

    res
      .status(err.statusCode || 500)
      .json({
        error: err.message
      });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // STOP GAMEMASTER if still running
  GameMaster.stopSession(id);

  try {
    const session = await deleteSession(id);

    res.json({
      message: 'Session deleted',
      session
    });
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
