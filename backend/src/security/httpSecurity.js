const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function configuredClientOrigin(environment) {
  const value = String(environment.CLIENT_URL || '').trim();
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    throw new Error('CLIENT_URL must be a valid absolute URL when configured.');
  }
}

export function createCorsOptions(environment = process.env) {
  const production = environment.NODE_ENV === 'production';
  const clientOrigin = configuredClientOrigin(environment);

  if (production && !clientOrigin) {
    throw new Error('Production API requires an explicit CLIENT_URL for CORS.');
  }

  const allowedOrigins = new Set(
    production ? [clientOrigin] : [...LOCAL_DEVELOPMENT_ORIGINS, clientOrigin]
  );
  allowedOrigins.delete(null);

  return {
    origin(origin, callback) {
      // Non-browser clients do not send Origin. Browser requests must match exactly.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);

      const error = new Error('Request origin is not allowed.');
      error.code = 'CORS_ORIGIN_DENIED';
      return callback(error);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Trez-Csrf'],
  };
}

export function setApiSecurityHeaders(_request, response, next) {
  response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');

  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

export function sendApiError(error, _request, response, _next) {
  if (response.headersSent) return;

  if (error?.code === 'CORS_ORIGIN_DENIED') {
    return response.status(403).json({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
    });
  }

  if (error?.type === 'entity.too.large') {
    return response.status(413).json({
      error: { code: 'REQUEST_BODY_TOO_LARGE', message: 'Request body exceeds the allowed size.' },
    });
  }

  console.error('Unhandled API request error', error);
  return response.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'The request could not be completed.' },
  });
}
