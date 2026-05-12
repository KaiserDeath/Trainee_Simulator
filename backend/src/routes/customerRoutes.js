import { Router } from 'express';

import {
  getCustomerHistory,
  getCustomerProfile,
  searchSessionCustomers
} from '../services/customerService.js';

const router = Router();

router.get('/:sessionId', async (
  req,
  res
) => {
  try {
    const customers =
      await searchSessionCustomers({
        sessionId:
          req.params.sessionId,
        query:
          req.query.q || ''
      });

    res.json(customers);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

router.get(
  '/:sessionId/:customerId',
  async (req, res) => {
    try {
      const customer =
        await getCustomerProfile({
          sessionId:
            req.params.sessionId,
          customerId:
            req.params.customerId
        });

      res.json(customer);
    } catch (err) {
      console.error(err);

      res
        .status(err.statusCode || 500)
        .json({
          error: err.message
        });
    }
  }
);

router.get(
  '/:sessionId/:customerId/history',
  async (req, res) => {
    try {
      const history =
        await getCustomerHistory({
          sessionId:
            req.params.sessionId,
          customerId:
            req.params.customerId
        });

      res.json(history);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);

export default router;
