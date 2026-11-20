import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { requireAdmin } from '../../lib/auth.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_TYPES = ['application/pdf'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB (PRD §7.3)
const MAX_PDF_BYTES = 5 * 1024 * 1024;   // 5 MB (PRD §7.3)

const RULES = {
  photo: {
    allowedContentTypes: IMAGE_TYPES,
    maximumSizeInBytes: MAX_IMAGE_BYTES,
    label: 'Photo must be JPG, PNG, or WebP and 4 MB or smaller.',
    prefix: 'uploads/photo',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  thumbnail: {
    allowedContentTypes: IMAGE_TYPES,
    maximumSizeInBytes: MAX_IMAGE_BYTES,
    label: 'Thumbnail must be JPG, PNG, or WebP and 4 MB or smaller.',
    prefix: 'uploads/thumb',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  resume: {
    allowedContentTypes: PDF_TYPES,
    maximumSizeInBytes: MAX_PDF_BYTES,
    label: 'Resume must be a PDF file and 5 MB or smaller.',
    prefix: 'uploads/resume',
    allowedExts: ['.pdf'],
  },
};

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sanitizeFilename(filename, allowedExts) {
  const base = String(filename || 'file').split(/[\\/]/).pop() || 'file';
  const dotIdx = base.lastIndexOf('.');
  const rawExt = dotIdx !== -1 ? base.slice(dotIdx).toLowerCase() : '';
  const ext = allowedExts.includes(rawExt) ? rawExt : allowedExts[0];
  const stem = (dotIdx !== -1 ? base.slice(0, dotIdx) : base)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'asset';
  return `${stem}${ext}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const auth = await requireAdmin(req, { checkOrigin: true });
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!blobToken) {
    return res.status(503).json({
      error: 'Uploads are not configured yet. Connect a Vercel Blob store in Vercel Storage.',
    });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const kind = String(body?.kind || '').toLowerCase();
  const rule = RULES[kind];
  if (!rule) {
    return res.status(400).json({ error: 'Invalid upload kind. Expected photo, thumbnail, or resume.' });
  }

  const contentType = String(body?.contentType || '').toLowerCase().trim();
  const size = Number(body?.size || 0);
  const filename = String(body?.filename || '');

  if (!rule.allowedContentTypes.includes(contentType)) {
    return res.status(400).json({ error: rule.label });
  }

  if (!Number.isFinite(size) || size <= 0 || size > rule.maximumSizeInBytes) {
    return res.status(400).json({ error: rule.label });
  }

  // Also reject suspicious extensions even if a client spoofs MIME type
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = filename.slice(dotIdx).toLowerCase();
    if (!rule.allowedExts.includes(ext)) {
      return res.status(400).json({ error: rule.label });
    }
  }

  const safeName = sanitizeFilename(filename, rule.allowedExts);
  const pathname = `${rule.prefix}-${Date.now()}-${safeName}`;

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: blobToken,
      pathname,
      allowedContentTypes: rule.allowedContentTypes,
      maximumSizeInBytes: rule.maximumSizeInBytes,
      addRandomSuffix: true,
      validUntil: Date.now() + 5 * 60 * 1000, // 5-minute short-lived upload token
    });

    return res.status(200).json({
      clientToken,
      pathname,
      uploadUrl: `https://blob.vercel-storage.com/${pathname}`,
      apiVersion: '9',
    });
  } catch (err) {
    console.error('[api/admin/upload] Token generation failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not prepare file upload.' });
  }
}
