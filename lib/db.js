import { neon } from '@neondatabase/serverless';
import { loadProfilesFromFiles } from './parseProfile.js';

export const MAX_CONTENT_BYTES = 800 * 1024; // 800 KB limit (PRD §11)

const getDatabaseUrl = () => (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

export const hasDatabase = () => Boolean(getDatabaseUrl());

function getClient() {
  const url = getDatabaseUrl();
  if (!url) return null;
  return neon(url);
}

let tableInitialized = false;

async function ensureTable(sql) {
  if (tableInitialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS portfolio_content (
        id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  } catch (err) {
    // Ignore concurrent CREATE TABLE IF NOT EXISTS catalog race (pg_type_typname_nsp_index)
    if (err?.code !== '23505') throw err;
  }
  tableInitialized = true;
}

const isPlaceholderPhoto = (url) => {
  const v = String(url || '').trim();
  return !v || v === '/assets/img/profile.svg' || v === '/assets/img/profile-placeholder.svg' || v === '/profile.svg';
};

function syncSharedPhoto(store) {
  const enPhoto = store?.en?.profile?.photo;
  const frPhoto = store?.fr?.profile?.photo;
  if (!isPlaceholderPhoto(enPhoto) && isPlaceholderPhoto(frPhoto)) {
    store.fr.profile.photo = enPhoto;
  } else if (!isPlaceholderPhoto(frPhoto) && isPlaceholderPhoto(enPhoto)) {
    store.en.profile.photo = frPhoto;
  }
  return store;
}

/**
 * Ensure stored JSON always has both { en, fr } keys and shares uploaded profile photo.
 */
async function normalizeStore(rawData) {
  if (rawData && typeof rawData === 'object' && rawData.en && rawData.fr) {
    return syncSharedPhoto({ en: rawData.en, fr: rawData.fr });
  }
  const files = await loadProfilesFromFiles();
  if (rawData && typeof rawData === 'object' && rawData.profile) {
    return syncSharedPhoto({ en: rawData, fr: files.fr });
  }
  return files;
}

/**
 * Validate a bilingual content store before saving to Postgres.
 */
export function validateStorePayload(store) {
  if (!store || typeof store !== 'object' || !store.en || !store.fr) {
    return { ok: false, error: 'Content must include both "en" and "fr" objects.' };
  }
  if (!store.en.profile || !store.fr.profile) {
    return { ok: false, error: 'Both "en" and "fr" must include a "profile" object.' };
  }
  const serialized = JSON.stringify({ en: store.en, fr: store.fr });
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > MAX_CONTENT_BYTES) {
    return { ok: false, error: `Content exceeds the 800 KB limit (${Math.round(byteLength / 1024)} KB).` };
  }
  return { ok: true, serialized };
}

/**
 * Read both languages from Neon Postgres, auto-seeding on first run.
 * Falls back to content/profile.md & content/profile.fr.md if DB is missing or unreachable.
 */
export async function getAllContent() {
  const sql = getClient();
  if (!sql) {
    const data = await loadProfilesFromFiles();
    return { data, source: 'files', dbAvailable: false, updatedAt: null };
  }

  try {
    await ensureTable(sql);
    const rows = await sql`SELECT data, updated_at FROM portfolio_content WHERE id = 1`;
    if (rows.length > 0) {
      const data = await normalizeStore(rows[0].data);
      return {
        data,
        source: 'db',
        dbAvailable: true,
        updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
      };
    }

    const seed = await loadProfilesFromFiles();
    await sql`
      INSERT INTO portfolio_content (id, data)
      VALUES (1, ${JSON.stringify(seed)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
    return { data: seed, source: 'db', dbAvailable: true, updatedAt: new Date().toISOString() };
  } catch (err) {
    console.error('[db] Database unavailable, falling back to profile files:', err?.message || err);
    const data = await loadProfilesFromFiles();
    return { data, source: 'files', dbAvailable: false, updatedAt: null };
  }
}

/**
 * Read a single language's public content ('en' or 'fr').
 */
export async function getContentByLang(lang = 'en') {
  const safeLang = lang === 'fr' ? 'fr' : 'en';
  const { data } = await getAllContent();
  return data[safeLang];
}

/**
 * Validate and persist both languages to Neon Postgres (parameterized upsert).
 */
export async function saveAllContent(store) {
  const sql = getClient();
  if (!sql) {
    const err = new Error('No database configured. Connect Neon Postgres in Vercel Storage.');
    err.statusCode = 503;
    throw err;
  }

  const check = validateStorePayload(store);
  if (!check.ok) {
    const err = new Error(check.error);
    err.statusCode = 400;
    throw err;
  }

  await ensureTable(sql);
  const rows = await sql`
    INSERT INTO portfolio_content (id, data, updated_at)
    VALUES (1, ${check.serialized}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data,
          updated_at = now()
    RETURNING updated_at
  `;

  return {
    updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Re-parse content/profile.md & content/profile.fr.md and overwrite the database row.
 */
export async function resetContentFromFiles() {
  const seed = await loadProfilesFromFiles();
  const { updatedAt } = await saveAllContent(seed);
  return { data: seed, updatedAt };
}
