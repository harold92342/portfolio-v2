// Best-effort per-instance in-memory rate limiter and login lockout tracker.
// Serverless instances do not share memory, so this mitigates bursts and
// brute-force attempts per warm instance without extra infrastructure.

const CHAT_WINDOW_MS = 60 * 1000; // 1 minute
const CHAT_MAX_REQUESTS = 15; // ~15 questions per minute per visitor (PRD §6.3)

const LOGIN_MAX_FAILURES = 5; // 5 wrong attempts -> 15-minute lockout (PRD §7.1)
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const chatHits = new Map();
const loginAttempts = new Map();

/**
 * Extract best-effort client IP from Node.js IncomingMessage or Fetch Request.
 */
export function getClientIp(req) {
  let forwarded = '';
  if (req?.headers) {
    if (typeof req.headers.get === 'function') {
      forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    } else {
      forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
    }
  }
  const first = forwarded.split(',')[0].trim();
  if (first) return first;
  return req?.socket?.remoteAddress || 'unknown';
}

/**
 * Enforce ~15 requests/minute per IP for POST /api/chat.
 */
export function checkChatRateLimit(ip, limit = CHAT_MAX_REQUESTS, windowMs = CHAT_WINDOW_MS) {
  const now = Date.now();
  const key = ip || 'unknown';
  const recent = (chatHits.get(key) || []).filter((ts) => now - ts < windowMs);

  if (recent.length >= limit) {
    chatHits.set(key, recent);
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  chatHits.set(key, recent);
  if (chatHits.size > 5000) chatHits.clear();
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Check whether an IP is currently locked out from /api/admin/login.
 */
export function checkLoginLockout(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const record = loginAttempts.get(key);
  if (!record) {
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: LOGIN_MAX_FAILURES };
  }

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((record.lockedUntil - now) / 1000)),
      remainingAttempts: 0,
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    loginAttempts.delete(key);
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: LOGIN_MAX_FAILURES };
  }

  return {
    locked: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, LOGIN_MAX_FAILURES - record.failures),
  };
}

/**
 * Record a failed login attempt. Locks out for 15 minutes on the 5th failure.
 */
export function recordFailedLogin(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const existing = loginAttempts.get(key);
  const failures = (existing && (!existing.lockedUntil || existing.lockedUntil <= now) ? existing.failures : 0) + 1;

  if (failures >= LOGIN_MAX_FAILURES) {
    const lockedUntil = now + LOGIN_LOCKOUT_MS;
    loginAttempts.set(key, { failures, lockedUntil });
    if (loginAttempts.size > 5000) loginAttempts.clear();
    return {
      locked: true,
      retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
      remainingAttempts: 0,
    };
  }

  loginAttempts.set(key, { failures, lockedUntil: 0 });
  if (loginAttempts.size > 5000) loginAttempts.clear();
  return {
    locked: false,
    retryAfterSeconds: 0,
    remainingAttempts: LOGIN_MAX_FAILURES - failures,
  };
}

/**
 * Reset failed login attempts for an IP after a successful sign-in.
 */
export function clearFailedLogins(ip) {
  loginAttempts.delete(ip || 'unknown');
}
