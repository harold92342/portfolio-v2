# Personal Portfolio with AI Assistant (v2.0)

Bilingual (**English `/`**, **French `/fr`**) personal portfolio for **Timothée (Timothy) Kabwe** — Project Analyst (Project Controls & PMO Reporting, PMP®, Power BI) — built with plain HTML, CSS, vanilla JavaScript, and small Node.js Vercel Functions.

No frontend framework, no build step, and zero fixed monthly cost at normal traffic levels (Vercel Free, Neon Postgres Free, Vercel Blob Free, Groq Free).

---

## Architecture

- **Public site (`/` and `/fr`):** Rendered by `api/page.js` from `templates/page.html` with live Open Graph tags and embedded JSON, then hydrated by `assets/app.js` and `assets/chat.js`.
- **AI assistant (`POST /api/chat`):** Grounded strictly in the live profile content, powered by Groq's free tier (`GROQ_API_KEY` server-side only) with streaming responses and browser voice input.
- **Private admin (`/admin`):** Password-protected with constant-time check, 5-attempt/15-minute lockout, HS256 JWT (`JWT_SECRET`) in an `HttpOnly; Secure; SameSite=Strict` cookie, bilingual editing, and direct browser-to-Vercel-Blob uploads (photo, resumes, project thumbnails).
- **Database & fallback (`lib/db.js`):** Single-row Neon Postgres table (`portfolio_content`). Automatically creates the table and seeds from `content/profile.md` & `content/profile.fr.md` on first run, and falls back to the profile files if the database is disconnected.

---

## Deploying to Vercel

1. **Push to GitHub.**
2. **Import into Vercel:**
   - Go to **Vercel → Add New → Project** and import your repository.
   - **Framework Preset:** `Other` (no build command, output directory = repo root).
3. **Connect Storage (Vercel → Storage tab):**
   - Connect **Neon Postgres** → automatically injects `DATABASE_URL`.
   - Connect **Vercel Blob** → automatically injects `BLOB_READ_WRITE_TOKEN`.
4. **Add Environment Variables (Settings → Environment Variables — Production & Preview):**
   - `GROQ_API_KEY` — free key from [console.groq.com](https://console.groq.com)
   - `GROQ_MODEL` *(optional)* — defaults to `llama-3.3-70b-versatile`
   - `ADMIN_PASSWORD` — strong passphrase for `/admin`
   - `JWT_SECRET` — at least 32 random characters (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
5. **Deploy** and open your live URL once — the database seeds itself automatically from `content/profile.md` and `content/profile.fr.md`.
6. **Optional domain:** Rename your `.vercel.app` domain (e.g. `timothy-kabwe.vercel.app`) or attach a custom domain in **Settings → Domains**.

---

## Day-to-Day Maintenance

- **Edit content, photo, or resumes:** Visit `/admin`, sign in, switch between **English (/)** and **Français (/fr)**, upload assets or edit text, and click **Save changes**. No redeploy is required.
- **Backup content:** Click **Export JSON** inside `/admin` to download a full bilingual backup.
- **Reset to Markdown files:** Click **Reset from files** in `/admin` to reload both languages from `content/profile.md` and `content/profile.fr.md`.
- **Change Groq model:** If Groq retires a model, update `GROQ_MODEL` in Vercel Environment Variables and redeploy.
- **Rotate password or sign out all sessions:** Change `ADMIN_PASSWORD` or `JWT_SECRET` in Vercel Environment Variables and redeploy.
- **Refresh LinkedIn link preview:** After editing your title or tagline in `/admin`, paste your `/` or `/fr` URL into [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) to refresh LinkedIn's cached card.

---

## Local Development

```bash
npm install
npx vercel dev
```

Copy `.env.example` to `.env.local` and fill in your local values before running `npx vercel dev`.
