import { requireAdmin } from '../../lib/auth.js';
import { getAllContent, resetContentFromFiles, saveAllContent } from '../../lib/db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'PUT', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const isWrite = req.method === 'PUT' || req.method === 'POST';
  const auth = await requireAdmin(req, { checkOrigin: isWrite });
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    if (req.method === 'GET') {
      const result = await getAllContent();
      return res.status(200).json(result);
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
      const payload = body?.data && body.data.en && body.data.fr ? body.data : body;
      const saved = await saveAllContent(payload);
      return res.status(200).json({ ok: true, updatedAt: saved.updatedAt });
    }

    // POST -> reset both languages from content/profile.md and content/profile.fr.md
    const reset = await resetContentFromFiles();
    return res.status(200).json({
      ok: true,
      data: reset.data,
      updatedAt: reset.updatedAt,
      source: 'db',
      dbAvailable: true,
    });
  } catch (err) {
    const status = err?.statusCode || 500;
    console.error(`[api/admin/content] ${req.method} error:`, err?.message || err);
    return res.status(status).json({ error: err?.message || 'Unable to process admin content request.' });
  }
}
