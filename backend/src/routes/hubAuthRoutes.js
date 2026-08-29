import { Router } from 'express';

import { sendHubError } from '../hub/hubAuthorization.js';

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendHubError(res, error);
    }
  };
}

export function createHubAuthRouter({ accountService, csrfProtection }) {
  const router = Router();

  router.get('/csrf', asyncRoute(async (req, res) => {
    const csrfToken = csrfProtection.issue(req, res);
    res.json({ csrfToken });
  }));

  router.post('/login', csrfProtection.middleware, asyncRoute(async (req, res) => {
    const result = await accountService.login({
      username: req.body?.username,
      password: req.body?.password,
      response: res,
    });
    res.json(result);
  }));

  router.use((error, _req, res, _next) => sendHubError(res, error));

  return router;
}
