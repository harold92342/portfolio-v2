import { getContentByLang } from '../lib/db.js';
import { buildSystemPrompt } from '../lib/prompt.js';
import { checkChatRateLimit, getClientIp } from '../lib/rateLimit.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 1200;

function getSiteOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function friendlyMessage(kind, lang, email) {
  const mailLink = `[${email}](mailto:${email})`;
  if (lang === 'fr') {
    if (kind === 'no-key') {
      return `Mon assistant n'est pas encore activé. Vous pouvez m'écrire directement à ${mailLink}.`;
    }
    if (kind === 'rate-limit') {
      return `Je reçois beaucoup de questions en ce moment. Réessayez dans une minute, ou écrivez-moi à ${mailLink}.`;
    }
    return `Désolé, je n'ai pas pu terminer cette réponse. Vous pouvez me contacter à ${mailLink}.`;
  }

  if (kind === 'no-key') {
    return `My assistant isn't switched on yet. You can write to me at ${mailLink}.`;
  }
  if (kind === 'rate-limit') {
    return `I'm getting a lot of questions right now. Try again in a minute, or write to me at ${mailLink}.`;
  }
  return `Sorry, I couldn't finish that answer. You can reach me at ${mailLink}.`;
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  const cleaned = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    if (!role) continue;
    const text = String(item.content ?? '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;
    cleaned.push({ role, content: text });
  }
  return cleaned.slice(-MAX_MESSAGES);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const lang = String(body?.lang || '').toLowerCase() === 'fr' ? 'fr' : 'en';
  const messages = sanitizeMessages(body?.messages);

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'At least one user message is required.' });
  }

  const content = await getContentByLang(lang);
  const email = content?.profile?.email || 'timothekabwe@gmail.com';

  // Rate limit per visitor IP (~15 questions/minute)
  const ip = getClientIp(req);
  const limitCheck = checkChatRateLimit(ip);
  if (!limitCheck.allowed) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Retry-After', String(limitCheck.retryAfterSeconds));
    return res.status(429).send(friendlyMessage('rate-limit', lang, email));
  }

  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(friendlyMessage('no-key', lang, email));
  }

  const model = (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
  const siteUrl = getSiteOrigin(req);
  const systemPrompt = buildSystemPrompt(content, siteUrl, lang);

  let groqRes;
  try {
    groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 400,
        stream: true,
      }),
    });
  } catch (err) {
    console.error('[api/chat] Network error calling Groq:', err?.message || err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(502).send(friendlyMessage('error', lang, email));
  }

  if (!groqRes.ok || !groqRes.body) {
    const status = groqRes.status;
    console.error('[api/chat] Groq API error status:', status);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (status === 429) {
      return res.status(429).send(friendlyMessage('rate-limit', lang, email));
    }
    return res.status(502).send(friendlyMessage('error', lang, email));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const reader = groqRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let wroteAnything = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const token = parsed?.choices?.[0]?.delta?.content;
          if (typeof token === 'string' && token.length > 0) {
            res.write(token);
            wroteAnything = true;
          }
        } catch {
          // Ignore malformed partial SSE frame
        }
      }
    }
  } catch (err) {
    console.error('[api/chat] Stream interrupted:', err?.message || err);
    const suffix = wroteAnything ? `\n\n${friendlyMessage('error', lang, email)}` : friendlyMessage('error', lang, email);
    res.write(suffix);
  } finally {
    if (!wroteAnything) {
      res.write(friendlyMessage('error', lang, email));
    }
    res.end();
  }
}
