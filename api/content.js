import { getContentByLang } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const rawLang = String(req.query?.lang || '').toLowerCase();
    const lang = rawLang === 'fr' ? 'fr' : 'en';
    const content = await getContentByLang(lang);

    const noCache =
      req.query?.refresh === '1' ||
      String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache');

    res.setHeader(
      'Cache-Control',
      noCache ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
    );
    return res.status(200).json({ lang, content });
  } catch (err) {
    console.error('[api/content] Error:', err);
    return res.status(500).json({ error: 'Unable to load content.' });
  }
}
