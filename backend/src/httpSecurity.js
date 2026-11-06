import {randomUUID,createHash} from 'node:crypto';

const metrics={startedAt:new Date().toISOString(),requests:0,errors:0,totalDurationMs:0,maxDurationMs:0,responseBytes:0};
export function runtimeMetrics(){return {...metrics,averageDurationMs:metrics.requests?Math.round(metrics.totalDurationMs/metrics.requests):0,scope:'This process since startup. Response Content-Length bytes; not provider egress.'};}

export function httpSecurity(req, res, next) {
  const started=performance.now();
  res.once('finish',()=>{const duration=Math.round(performance.now()-started);metrics.requests++;if(res.statusCode>=500)metrics.errors++;metrics.totalDurationMs+=duration;metrics.maxDurationMs=Math.max(metrics.maxDurationMs,duration);metrics.responseBytes+=Number(res.getHeader('Content-Length'))||0;});
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Request-Id', randomUUID());
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'private, no-store');
  next();
}

// Bounded per-process admission control; use edge controls as well for multiple replicas.
export function createLoginLimiter({now = Date.now, limit = 20, windowMs = 60000, capacity = 10000} = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [key, entry] of attempts) if (entry.expires <= time) attempts.delete(key);
    // Do not trust forwarded IP headers. Render may share a proxy address;
    // account buckets prevent one learner consuming another learner's budget.
    const key = createHash('sha256').update(`${req.ip}:${String(req.body?.username||'').trim().toLowerCase()}`).digest('hex');
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= capacity) return res.status(429).set('Retry-After', '60').json({error:{code:'HUB_LOGIN_THROTTLED',message:'Too many sign-in attempts. Try again shortly.'}});
      entry = {count:0, expires:time + windowMs}; attempts.set(key, entry);
    }
    if (++entry.count > limit) return res.status(429).set('Retry-After', String(Math.ceil((entry.expires-time)/1000))).json({error:{code:'HUB_LOGIN_THROTTLED',message:'Too many sign-in attempts. Try again shortly.'}});
    next();
  };
}
