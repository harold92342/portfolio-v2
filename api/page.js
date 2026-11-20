import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContentByLang } from '../lib/db.js';

let cachedTemplate = null;

async function getTemplate() {
  if (cachedTemplate) return cachedTemplate;
  const tplPath = path.join(process.cwd(), 'templates', 'page.html');
  cachedTemplate = await fs.readFile(tplPath, 'utf8');
  return cachedTemplate;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getSiteOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function resolveAbsoluteUrl(origin, target) {
  const value = String(target || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const rel = value.startsWith('/') ? value : `/${value}`;
  return origin ? `${origin}${rel}` : rel;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const rawLang = String(req.query?.lang || '').toLowerCase();
    const lang = rawLang === 'fr' ? 'fr' : 'en';

    const [template, content] = await Promise.all([getTemplate(), getContentByLang(lang)]);
    const profile = content.profile || {};
    const origin = getSiteOrigin(req);

    const name = profile.name || (lang === 'fr' ? 'Timothée Kabwe' : 'Timothy Kabwe');
    const title = profile.title ? `${name} — ${profile.title}` : name;
    const description = profile.tagline || profile.title || name;
    const pageUrl = `${origin}${lang === 'fr' ? '/fr' : '/'}`;
    const ogImage = resolveAbsoluteUrl(origin, profile.photo || '/assets/img/profile.svg');

    const replacements = {
      '{{LANG}}': lang,
      '{{TITLE}}': escapeHtml(title),
      '{{DESCRIPTION}}': escapeHtml(description),
      '{{OG_TITLE}}': escapeHtml(title),
      '{{OG_DESCRIPTION}}': escapeHtml(description),
      '{{OG_URL}}': escapeHtml(pageUrl),
      '{{OG_IMAGE}}': escapeHtml(ogImage),
      '{{OG_LOCALE}}': lang === 'fr' ? 'fr_FR' : 'en_US',
      '{{ALT_EN_URL}}': escapeHtml(`${origin}/`),
      '{{ALT_FR_URL}}': escapeHtml(`${origin}/fr`),
      '{{SKIP_LABEL}}': lang === 'fr' ? 'Aller au contenu principal' : 'Skip to main content',
      '{{SWITCH_HREF}}': lang === 'fr' ? '/' : '/fr',
      '{{SWITCH_TARGET}}': lang === 'fr' ? 'en' : 'fr',
      '{{SWITCH_SHORT}}': lang === 'fr' ? 'EN' : 'FR',
      '{{SWITCH_LABEL}}': lang === 'fr' ? 'English' : 'Français',
      '{{EMBEDDED_JSON}}': escapeJsonForScript({ lang, content }),
    };

    let html = template;
    for (const [token, value] of Object.entries(replacements)) {
      html = html.split(token).join(value);
    }

    const noCache =
      req.query?.refresh === '1' ||
      String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      noCache ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
    );
    return res.status(200).send(html);
  } catch (err) {
    console.error('[api/page] Failed to render page:', err);
    return res.status(500).send('Unable to render page.');
  }
}
