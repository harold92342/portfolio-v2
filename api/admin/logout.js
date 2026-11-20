import { buildClearCookie, isSameOrigin } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }

  res.setHeader('Set-Cookie', buildClearCookie(req));
  return res.status(200).json({ ok: true });
}
