export function createReadiness({client, worker = () => null, required = false, now = Date.now}) {
  let cached;
  let pending;
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!cached || now() - cached.at > 5000) {
      pending ||= (async () => {
        try {
          const result = await client.from('hub_identities').select('id').limit(1).abortSignal(AbortSignal.timeout(3000));
          return {at:now(), database:!result.error};
        } catch { return {at:now(), database:false}; }
      })();
      try { cached = await pending; } finally { pending = null; }
    }
    const status = worker()?.status?.();
    const workerReady = !required || Boolean(status && !status.stopped && status.lastSuccessAt && now()-status.lastSuccessAt < 90000);
    const ready = cached.database && workerReady;
    res.status(ready ? 200 : 503).json({status:ready?'ready':'unavailable',database:cached.database?'ready':'unavailable',worker:required?(workerReady?'ready':'unavailable'):'not-required',revision:process.env.RENDER_GIT_COMMIT || null});
  };
}
