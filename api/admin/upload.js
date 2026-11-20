import { put } from '@vercel/blob';
import { requireAdmin } from '../../lib/auth.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_TYPES = ['application/pdf'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB (PRD §7.3)
const MAX_PDF_BYTES = 4.4 * 1024 * 1024; // ~4.4 MB (within Vercel Function body limit)

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
    label: 'Resume must be a PDF file and 4.4 MB or smaller.',
    prefix: 'uploads/resume',
    allowedExts: ['.pdf'],
  },
};

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

async function readBinaryBody(req, maxBytes) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw new Error('TOO_LARGE');
    return req.body;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error('TOO_LARGE');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

  const hasBlobConfig = Boolean(
    (process.env.BLOB_READ_WRITE_TOKEN || '').trim() ||
    (process.env.BLOB_STORE_ID || '').trim(),
  );
  if (!hasBlobConfig) {
    return res.status(503).json({
      error: 'Uploads are not configured yet. Connect a Public Vercel Blob store in Vercel Storage.',
    });
  }

  const kind = String(req.query?.kind || req.headers['x-upload-kind'] || '').toLowerCase();
  const rule = RULES[kind];
  if (!rule) {
    return res.status(400).json({ error: 'Invalid upload kind. Expected photo, thumbnail, or resume.' });
  }

  const contentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .toLowerCase()
    .trim();
  const filename = String(req.query?.filename || req.headers['x-upload-filename'] || '');

  if (!rule.allowedContentTypes.includes(contentType)) {
    return res.status(400).json({ error: rule.label });
  }

  // Reject disallowed extensions even if MIME type is spoofed
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = filename.slice(dotIdx).toLowerCase();
    if (!rule.allowedExts.includes(ext)) {
      return res.status(400).json({ error: rule.label });
    }
  }

  let buffer;
  try {
    buffer = await readBinaryBody(req, rule.maximumSizeInBytes);
  } catch (err) {
    if (err?.message === 'TOO_LARGE') {
      return res.status(400).json({ error: rule.label });
    }
    return res.status(400).json({ error: 'Could not read uploaded file.' });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty.' });
  }

  const safeName = sanitizeFilename(filename, rule.allowedExts);
  const pathname = `${rule.prefix}-${Date.now()}-${safeName}`;

  try {
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (err) {
    console.error('[api/admin/upload] Vercel Blob put failed:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'Upload to Vercel Blob failed.',
    });
  }
}
