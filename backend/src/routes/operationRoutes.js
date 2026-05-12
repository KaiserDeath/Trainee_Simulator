import { Router } from 'express';

import {
  getPendingOperations,
  processOperation
} from '../services/operationService.js';

const router = Router();

router.get('/:sessionId', async (
  req,
  res
) => {
  try {
    const operations =
      await getPendingOperations(
        req.params.sessionId
      );

    res.json(operations);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

router.post('/:id/process', async (
  req,
  res
) => {
  try {
    const result =
      await processOperation(
        req.params.id,
        req.body
      );

    res.json(result);
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
