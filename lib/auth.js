import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'admin_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours (PRD §7.1, §11)

function getJwtSecretBytes() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Constant-time password comparison against ADMIN_PASSWORD.
 * Hashes both values to 32-byte digests first so length differences never leak timing.
 */
export function verifyPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || typeof candidate !== 'string' || !candidate) {
    return false;
  }
  const expectedHash = crypto.createHash('sha256').update(expected, 'utf8').digest();
  const candidateHash = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  return crypto.timingSafeEqual(expectedHash, candidateHash);
}

/**
 * Sign an 8-hour HS256 JWT for the admin session.
 */
export async function signAdminToken() {
  const secret = getJwtSecretBytes();
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

/**
 * Verify an HS256 JWT and confirm role === 'admin'. Returns payload or null.
 */
export async function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const secret = getJwtSecretBytes();
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (payload?.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Read a header from either Node.js IncomingMessage or Fetch Request.
 */
function getHeader(req, name) {
  if (!req?.headers) return '';
  if (typeof req.headers.get === 'function') {
    return req.headers.get(name) || '';
  }
  return String(req.headers[name.toLowerCase()] || '');
}

/**
 * Parse Cookie header into a key/value map.
 */
export function parseCookies(req) {
  const header = getHeader(req, 'cookie');
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

function isSecureRequest(req) {
  const proto = getHeader(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;
  const host = getHeader(req, 'host').toLowerCase();
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;
  return true;
}

/**
 * Serialize the signed JWT into a secure HttpOnly SameSite=Strict cookie.
 */
export function buildSessionCookie(token, req) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Serialize a cookie header that immediately clears the admin session.
 */
export function buildClearCookie(req) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Verify that an admin request originated from the site's own host (CSRF protection).
 */
export function isSameOrigin(req) {
  const host = (getHeader(req, 'x-forwarded-host') || getHeader(req, 'host'))
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!host) return false;

  const origin = getHeader(req, 'origin').trim();
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  const referer = getHeader(req, 'referer').trim();
  if (referer) {
    try {
      return new URL(referer).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Authenticate an admin API request.
 * Returns { ok: true, payload } or { ok: false, status: 401 | 403, error }.
 */
export async function requireAdmin(req, { checkOrigin = false } = {}) {
  if (checkOrigin && !isSameOrigin(req)) {
    return { ok: false, status: 403, error: 'Cross-origin request rejected.' };
  }
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const payload = await verifyAdminToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }
  return { ok: true, payload };
}
