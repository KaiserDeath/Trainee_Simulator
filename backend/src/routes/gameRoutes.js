import { Router } from 'express';

import {
  createGameAccount,
  getGameAccount,
  getGameAccountHistory,
  rechargeAccount,
  redeemAccount,
  resetGamePassword,
  searchGameAccounts
} from '../services/gameSimulationService.js';

const router = Router();

router.get(
  '/:sessionId/:game/accounts',
  async (req, res) => {
    try {
      const accounts =
        await searchGameAccounts({
          sessionId:
            req.params.sessionId,
          game: req.params.game,
          query:
            req.query.q || ''
        });

      res.json(accounts);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err.message
      });
    }
  }
);

router.get(
  '/accounts/:accountId',
  async (req, res) => {
    try {
      const account =
        await getGameAccount(
          req.params.accountId
        );

      res.json(account);
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

router.post(
  '/accounts/:accountId/recharge',
  async (req, res) => {
    try {
      const account =
        await rechargeAccount({
          accountId:
            req.params.accountId,
          amount: req.body.amount
        });

      res.json(account);
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

router.post(
  '/accounts/:accountId/redeem',
  async (req, res) => {
    try {
      const account =
        await redeemAccount({
          accountId:
            req.params.accountId,
          amount: req.body.amount
        });

      res.json(account);
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

router.post(
  '/accounts/:accountId/reset-password',
  async (req, res) => {
    try {
      const account =
        await resetGamePassword({
          accountId:
            req.params.accountId,
          newPassword:
            req.body.newPassword
        });

      res.json(account);
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

router.post(
  '/:sessionId/:game/accounts',
  async (req, res) => {
    try {
      const account =
        await createGameAccount({
          sessionId:
            req.params.sessionId,
          game: req.params.game,
          customerId:
            req.body.customerId,
          gameUsername:
            req.body.gameUsername,
          password:
            req.body.password,
          customerName:
            req.body.customerName
        });

      res.json(account);
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
  '/:sessionId/customers/:customerId/history',
  async (req, res) => {
    try {
      const history =
        await getGameAccountHistory({
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
