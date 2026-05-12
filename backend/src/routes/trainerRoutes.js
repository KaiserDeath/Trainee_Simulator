import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

import { buildSessionReport }
  from '../engine/SessionEngine.js';

const router = Router();

//
// GET ALL SESSIONS
//
router.get('/sessions', async (
  req,
  res
) => {

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
