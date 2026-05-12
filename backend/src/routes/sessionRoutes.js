import { Router } from 'express';

import { supabase } from '../config/supabase.js';

import { createSandboxSession }
  from '../services/sandboxService.js';

import GameMaster
  from '../engine/GameMaster.js';

const router = Router();

router.get('/', async (req, res) => {
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

  const { data, error } = await supabase
    .from('trainee_sessions')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.json({
    message: 'Session ended',
    session: data
  });
});

export default router;