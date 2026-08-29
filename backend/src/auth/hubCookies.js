import { parse, serialize } from 'cookie';

export const HUB_ACCESS_COOKIE = 'trez_hub_access';
export const HUB_REFRESH_COOKIE = 'trez_hub_refresh';
export const HUB_CSRF_COOKIE = 'trez_hub_csrf';

export function readHubCookies(request) {
  return parse(request.headers.cookie || '');
}

function appendCookie(response, value) {
  response.append('Set-Cookie', value);
  response.set('Cache-Control', 'private, no-store');
  response.set('Pragma', 'no-cache');
}

function cookieOptions(config, httpOnly) {
  return {
    httpOnly,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/api/hub',
  };
}

export function setHubSessionCookies(response, config, session) {
  appendCookie(response, serialize(
    HUB_ACCESS_COOKIE,
    session.access_token,
    cookieOptions(config, true)
  ));
  appendCookie(response, serialize(
    HUB_REFRESH_COOKIE,
    session.refresh_token,
    cookieOptions(config, true)
  ));
}

export function setHubCsrfCookie(response, config, token) {
  appendCookie(response, serialize(
    HUB_CSRF_COOKIE,
    token,
    cookieOptions(config, false)
  ));
}

export function clearHubSessionCookies(response, config) {
  for (const [name, httpOnly] of [
    [HUB_ACCESS_COOKIE, true],
    [HUB_REFRESH_COOKIE, true],
    [HUB_CSRF_COOKIE, false],
  ]) {
    appendCookie(response, serialize(name, '', {
      ...cookieOptions(config, httpOnly),
      expires: new Date(0),
      maxAge: 0,
    }));
  }
}
