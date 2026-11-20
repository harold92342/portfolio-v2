import {
  buildSessionCookie,
  isSameOrigin,
  signAdminToken,
  verifyPassword,
} from '../../lib/auth.js';
import {
  checkLoginLockout,
  clearFailedLogins,
  getClientIp,
  recordFailedLogin,
} from '../../lib/rateLimit.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }

  const ip = getClientIp(req);
  const lockStatus = checkLoginLockout(ip);
  if (lockStatus.locked) {
    const minutes = Math.max(1, Math.ceil(lockStatus.retryAfterSeconds / 60));
    res.setHeader('Retry-After', String(lockStatus.retryAfterSeconds));
    return res.status(429).json({
      error: `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      retryAfterSeconds: lockStatus.retryAfterSeconds,
    });
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
    return res.status(503).json({
      error: 'Admin authentication is not configured on the server (missing ADMIN_PASSWORD or JWT_SECRET).',
    });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!verifyPassword(password)) {
    const result = recordFailedLogin(ip);
    if (result.locked) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many failed attempts. Locked out for 15 minutes.',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return res.status(401).json({
      error: `Incorrect password. ${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? '' : 's'} remaining before a 15-minute lockout.`,
      remainingAttempts: result.remainingAttempts,
    });
  }

  clearFailedLogins(ip);

  try {
    const token = await signAdminToken();
    res.setHeader('Set-Cookie', buildSessionCookie(token, req));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/admin/login] Token signing failed:', err?.message || err);
    return res.status(500).json({ error: 'Server authentication configuration error.' });
  }
}
