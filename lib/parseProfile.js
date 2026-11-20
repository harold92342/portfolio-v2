import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const str = (value) => (value == null ? '' : String(value).trim());

const splitPipes = (line) => line.split('|').map((part) => part.trim());

const bulletLines = (body) =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim());

/**
 * Convert a heading string into a URL-safe slug (e.g. "Prexora — PMP" -> "prexora-pmp").
 */
export function slugify(text) {
  return str(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Split a markdown body into an array of { heading, body } blocks at the given heading level.
 */
function splitByHeading(body, level) {
  const marker = `${'#'.repeat(level)} `;
  const out = [];
  let current = null;

  for (const line of body.split('\n')) {
    if (line.startsWith(marker)) {
      if (current) {
        out.push({ heading: current.heading, body: current.lines.join('\n').trim() });
      }
      current = { heading: line.slice(marker.length).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    out.push({ heading: current.heading, body: current.lines.join('\n').trim() });
  }
  return out;
}

/**
 * Parse a profile markdown file (content/profile.md or content/profile.fr.md) into structured JSON.
 */
export function parseProfile(markdown, lang = 'en') {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  const { data, content } = matter(normalized);
  const body = content.replace(/<!--[\s\S]*?-->/g, '');

  const defaultResume = lang === 'fr' ? '/assets/resume-fr.pdf' : '/assets/resume.pdf';

  const profile = {
    name: str(data.name),
    title: str(data.title),
    tagline: str(data.tagline),
    location: str(data.location),
    email: str(data.email),
    linkedin: str(data.linkedin),
    github: str(data.github),
    website: str(data.website),
    photo: str(data.photo) || '/assets/img/profile.svg',
    resume: str(data.resume) || defaultResume,
    availability: str(data.availability),
  };

  const sections = new Map(
    splitByHeading(body, 2).map((section) => [section.heading.toLowerCase(), section.body]),
  );
  const sec = (name) => sections.get(name) ?? '';

  const experience = splitByHeading(sec('experience'), 3).map(({ heading, body: expBody }) => {
    const [role = '', company = '', start = '', end = '', location = ''] = splitPipes(heading);
    return {
      role,
      company,
      start,
      end,
      location,
      bullets: bulletLines(expBody),
    };
  });

  const projects = splitByHeading(sec('projects'), 3).map(({ heading, body: projBody }) => {
    const meta = {};
    const rest = [];
    let inMeta = true;

    for (const line of projBody.split('\n')) {
      const match = line.match(/^(summary|thumbnail|video|link|tags):\s*(.*)$/i);
      if (inMeta && match) {
        meta[match[1].toLowerCase()] = match[2].trim();
      } else {
        if (line.trim()) inMeta = false;
        rest.push(line);
      }
    }

    return {
      slug: slugify(heading),
      title: heading,
      summary: meta.summary ?? '',
      details: rest.join('\n').trim(),
      thumbnail: meta.thumbnail ?? '',
      video: meta.video ?? '',
      link: meta.link ?? '',
      tags: (meta.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
  });

  const skills = bulletLines(sec('skills')).map((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      return { group: lang === 'fr' ? 'Compétences' : 'Skills', items: [line] };
    }
    return {
      group: line.slice(0, colonIndex).trim(),
      items: line
        .slice(colonIndex + 1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
  });

  const highlights = bulletLines(sec('highlights')).map((line) => {
    const [value = '', label = ''] = splitPipes(line);
    return { value, label };
  });

  const certifications = bulletLines(sec('certifications')).map((line) => {
    const [name = '', issuer = '', detail = ''] = splitPipes(line);
    return { name, issuer, detail };
  });

  const education = bulletLines(sec('education')).map((line) => {
    const [degree = '', school = '', period = ''] = splitPipes(line);
    return { degree, school, period };
  });

  const faq = splitByHeading(sec('faq'), 3).map(({ heading, body: faqBody }) => ({
    q: heading,
    a: faqBody,
  }));

  return {
    profile,
    bio: sec('bio'),
    highlights,
    experience,
    projects,
    skills,
    certifications,
    education,
    faq,
    suggestedQuestions: bulletLines(sec('suggested questions')),
  };
}

const PROFILE_FILES = {
  en: 'profile.md',
  fr: 'profile.fr.md',
};

/**
 * Load and parse a single language's profile markdown from content/.
 */
export async function loadProfileFile(lang = 'en') {
  const safeLang = lang === 'fr' ? 'fr' : 'en';
  const filePath = path.join(process.cwd(), 'content', PROFILE_FILES[safeLang]);
  const raw = await fs.readFile(filePath, 'utf8');
  return parseProfile(raw, safeLang);
}

/**
 * Load and parse both English and French profile files into { en, fr }.
 */
export async function loadProfilesFromFiles() {
  const [en, fr] = await Promise.all([loadProfileFile('en'), loadProfileFile('fr')]);
  return { en, fr };
}
