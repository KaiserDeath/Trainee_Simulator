import { Router } from 'express';

import { supabase } from '../config/supabase.js';

import { createSandboxSession }
  from '../services/sandboxService.js';

import GameMaster
  from '../engine/GameMaster.js';
import {
  completeSession,
  deleteSession,
  submitSession
} from '../engine/SessionEngine.js';

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
    const { traineeName, durationMinutes } = req.body;

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
    if (req.app.locals.simulatorAuthRequired) {
      const owner = await supabase.from('hub_identities').select('id').eq('external_subject_reference',req.hubIdentity.subjectId).eq('status','active').single();
      if(owner.error||!owner.data){await deleteSession(session.id);throw new Error('Simulator identity is unavailable.');}
      const link=await supabase.from('hub_simulator_sessions').insert({session_id:session.id,identity_id:owner.data.id});
      if(link.error){await deleteSession(session.id);throw new Error('Simulator identity could not be linked.');}
    }

    let minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      try {
        const { data, error } = await supabase
          .from('simulator_settings')
          .select('value')
          .eq('key', 'session_timeout_minutes')
          .maybeSingle();
        if (!error && data) {
          minutes = Number(data.value);
        } else {
          minutes = 30;
        }
      } catch (dbErr) {
        console.error('Error reading timeout from database, using 30 mins fallback:', dbErr);
        minutes = 30;
      }
    }
    const durationMs = Math.round(minutes * 60 * 1000);

    // Persist timing and register the durable job before reporting success.
    const timing = await supabase
        .from('trainee_sessions')
        .update({ duration_minutes: minutes, runtime_mode: 'free_simulator' })
        .eq('id', session.id);
    if(timing.error){
      await deleteSession(session.id);
      throw new Error('Session timing could not be saved.');
    }
    session.duration_minutes = minutes;
    if(process.env.TREZ_DURABLE_SIMULATION!=='true'&&process.env.NODE_ENV!=='production')await GameMaster.startSession(session.id,durationMs);

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

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('trainee_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: error?.message || 'Session not found'
      });
    }

    res.json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

router.post('/:id/submit', async (req, res) => {
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
