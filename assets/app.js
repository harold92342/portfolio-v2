(function () {
  'use strict';

  const STRINGS = {
    en: {
      nav: [
        { href: '#experience', label: 'Experience' },
        { href: '#projects', label: 'Projects' },
        { href: '#skills', label: 'Skills' },
        { href: '#contact', label: 'Contact' },
      ],
      viewResume: 'View resume',
      askAssistant: 'Ask my assistant',
      emailMe: 'Email me',
      about: 'About',
      experience: 'Experience',
      to: '–',
      present: 'Present',
      projects: 'Projects',
      watchVideo: 'Watch video',
      viewProject: 'View project',
      skills: 'Skills',
      certifications: 'Certifications',
      education: 'Education',
      contact: 'Contact',
      contactLead: 'Open to conversations about Project Controls, PMO Reporting, Data Analytics, Microsoft 365 Copilot, or training.',
      emailLabel: 'Email',
      linkedinLabel: 'LinkedIn',
      githubLabel: 'GitHub',
      websiteLabel: 'Website',
      themeToDark: 'Switch to dark theme',
      themeToLight: 'Switch to light theme',
      closeModal: 'Close project details',
    },
    fr: {
      nav: [
        { href: '#experience', label: 'Expérience' },
        { href: '#projects', label: 'Projets' },
        { href: '#skills', label: 'Compétences' },
        { href: '#contact', label: 'Contact' },
      ],
      viewResume: 'Voir le CV',
      askAssistant: 'Parler à mon assistant',
      emailMe: 'M’écrire',
      about: 'À propos',
      experience: 'Expérience',
      to: '–',
      present: "Aujourd'hui",
      projects: 'Projets',
      watchVideo: 'Voir la vidéo',
      viewProject: 'Voir le projet',
      skills: 'Compétences',
      certifications: 'Certifications',
      education: 'Formation',
      contact: 'Contact',
      contactLead: 'Disponible pour échanger autour du contrôle de projet, du reporting PMO, de l’analyse de données, de Microsoft 365 Copilot ou de formations.',
      emailLabel: 'E-mail',
      linkedinLabel: 'LinkedIn',
      githubLabel: 'GitHub',
      websiteLabel: 'Site web',
      themeToDark: 'Passer en thème sombre',
      themeToLight: 'Passer en thème clair',
      closeModal: 'Fermer les détails du projet',
    },
  };

  const MONTHS = [
    ['jan'], ['feb', 'fév', 'fev'], ['mar'], ['apr', 'avr'], ['may', 'mai'], ['jun', 'juin'],
    ['jul', 'juil'], ['aug', 'aoû', 'aou'], ['sep'], ['oct'], ['nov'], ['dec', 'déc'],
  ];

  const FALLBACK_THUMBS = [
    '/assets/img/project-fallback-1.svg',
    '/assets/img/project-fallback-2.svg',
    '/assets/img/project-fallback-3.svg',
  ];

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function svgEl(tag, attrs, ...children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v != null) node.setAttribute(k, String(v));
      }
    }
    for (const child of children.flat()) {
      if (child) node.appendChild(child);
    }
    return node;
  }

  function safeUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value)) return value;
    return '';
  }

  // Deterministic Malachite concentric rings (Copperbelt mineral cross-section)
  function createMalachiteSvg() {
    let s = 17;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const cx = 300;
    const cy = 300;
    const phases = [rand() * 6, rand() * 6, rand() * 6];
    const paths = [];
    const count = 22;
    const steps = 96;

    for (let i = count; i >= 1; i--) {
      const base = 28 + i * 10.5;
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const wobble =
          Math.sin(a * 3 + phases[0] + i * 0.18) * (3 + i * 0.4) +
          Math.sin(a * 5 + phases[1] - i * 0.11) * (1.5 + i * 0.18) +
          Math.sin(a * 2 + phases[2]) * i * 0.35;
        const rad = base + wobble;
        pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad * 0.92).toFixed(1)}`);
      }
      paths.push(svgEl('path', { d: `M${pts.join('L')}Z`, class: `band band-${i % 4}` }));
    }

    return svgEl('svg', { class: 'malachite', viewBox: '0 0 600 600', 'aria-hidden': 'true', focusable: 'false' }, paths);
  }

  function createThemeIcon(isDark) {
    if (isDark) {
      return svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        svgEl('circle', { cx: 12, cy: 12, r: 4 }),
        svgEl('path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }),
      );
    }
    return svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      svgEl('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }),
    );
  }

  function focusChatInput() {
    const section = document.getElementById('assistant');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus({ preventScroll: true });
    }, 320);
  }

  function isOngoing(s) {
    return !String(s || '').trim() || /present|now|aujourd|en cours|actuel|current/i.test(String(s));
  }

  function toMonth(s, now) {
    const t = String(s || '').trim().toLowerCase();
    if (isOngoing(t)) return now;
    const match = t.match(/(19|20)\d{2}/);
    if (!match) return now;
    const year = Number(match[0]);
    const mi = MONTHS.findIndex((names) => names.some((m) => t.includes(m)));
    return year * 12 + (mi === -1 ? 0 : mi);
  }

  function renderParagraphs(container, text) {
    container.textContent = '';
    const blocks = String(text || '').trim().split(/\n{2,}/).filter(Boolean);
    for (const block of blocks) {
      const p = el('p');
      const lines = block.split('\n');
      lines.forEach((line, idx) => {
        if (idx > 0) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      container.appendChild(p);
    }
  }

  function loadInitialPayload() {
    const script = document.getElementById('portfolio-data');
    if (script && script.textContent) {
      try {
        return JSON.parse(script.textContent);
      } catch (_) {}
    }
    return null;
  }

  function initPortfolio(payload) {
    const lang = payload.lang === 'fr' ? 'fr' : 'en';
    const content = payload.content || {};
    const profile = content.profile || {};
    const t = STRINGS[lang];

    // Expose state for chat.js and modal deep-linking
    window.__PORTFOLIO__ = { lang, content };

    // 1. Top bar navigation, language switch, theme toggle
    const navEl = document.getElementById('site-nav');
    if (navEl) {
      navEl.textContent = '';
      for (const item of t.nav) {
        navEl.appendChild(el('a', { href: item.href, text: item.label }));
      }
    }

    const langSwitch = document.getElementById('lang-switch');
    if (langSwitch) {
      langSwitch.addEventListener('click', () => {
        try {
          localStorage.setItem('portfolio_lang', lang === 'fr' ? 'en' : 'fr');
        } catch (_) {}
      });
    }

    const themeBtn = document.getElementById('theme-toggle');
    function syncThemeButton() {
      if (!themeBtn) return;
      const isDark = document.documentElement.dataset.theme === 'dark';
      themeBtn.textContent = '';
      themeBtn.appendChild(createThemeIcon(isDark));
      themeBtn.setAttribute('aria-label', isDark ? t.themeToLight : t.themeToDark);
      themeBtn.setAttribute('aria-pressed', String(isDark));
    }
    syncThemeButton();
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('portfolio_theme', next);
        } catch (_) {}
        syncThemeButton();
      });
    }

    // 2. Hero section
    const heroEl = document.getElementById('hero');
    if (heroEl) {
      heroEl.textContent = '';
      const nameParts = String(profile.name || 'Timothy Kabwe').trim().split(/\s+/);
      const firstLine = nameParts[0] || '';
      const restLine = nameParts.slice(1).join(' ');

      const h1 = el('h1', { id: 'hero-name' },
        el('span', { text: firstLine }),
        restLine ? el('span', { text: restLine }) : null,
      );

      const titleRow = el('p', { class: 'hero-title' },
        el('span', { text: profile.title || '' }),
        profile.location ? el('span', { class: 'hero-place', text: profile.location }) : null,
      );

      const actions = el('div', { class: 'hero-actions' });
      const resumeHref = safeUrl(profile.resume);
      if (resumeHref) {
        actions.appendChild(el('a', {
          class: 'btn btn-primary',
          href: resumeHref,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: t.viewResume,
        }));
      }
      actions.appendChild(el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        text: t.askAssistant,
        onClick: focusChatInput,
      }));
      if (profile.email) {
        actions.appendChild(el('a', {
          class: 'btn btn-link',
          href: `mailto:${profile.email}`,
          text: t.emailMe,
        }));
      }

      const heroCopy = el('div', { class: 'hero-copy' },
        h1,
        titleRow,
        profile.tagline ? el('p', { class: 'hero-tagline', text: profile.tagline }) : null,
        actions,
      );

      const photoSrc = safeUrl(profile.photo) || '/assets/img/profile.svg';
      const portrait = el('img', {
        class: 'portrait',
        src: photoSrc,
        alt: profile.name || 'Profile portrait',
        width: '290',
        height: '290',
      });
      portrait.addEventListener('error', () => {
        if (portrait.src.indexOf('profile-placeholder.svg') === -1) {
          portrait.src = '/assets/img/profile-placeholder.svg';
        }
      });

      const heroVisual = el('div', { class: 'hero-visual' }, createMalachiteSvg(), portrait);
      heroEl.append(heroCopy, heroVisual);
    }

    // 3. Highlights
    const highlightsEl = document.getElementById('highlights');
    if (highlightsEl) {
      highlightsEl.textContent = '';
      const items = Array.isArray(content.highlights) ? content.highlights : [];
      if (!items.length) {
        highlightsEl.hidden = true;
      } else {
        highlightsEl.hidden = false;
        for (const item of items) {
          highlightsEl.appendChild(el('li', null,
            el('strong', { text: item.value || '' }),
            el('span', { text: item.label || '' }),
          ));
        }
      }
    }

    // 4. About
    const aboutEl = document.getElementById('about');
    if (aboutEl) {
      aboutEl.textContent = '';
      const bioContainer = el('div', { class: 'prose lead' });
      renderParagraphs(bioContainer, content.bio || '');
      const rightCol = el('div', null,
        bioContainer,
        profile.availability ? el('p', { class: 'availability', text: profile.availability }) : null,
      );
      aboutEl.append(el('h2', { id: 'about-heading', text: t.about }), rightCol);
    }

    // 5. Experience (Gantt timeline)
    const expEl = document.getElementById('experience');
    if (expEl) {
      expEl.textContent = '';
      expEl.appendChild(el('h2', { id: 'experience-heading', text: t.experience }));

      const expItems = Array.isArray(content.experience) ? content.experience : [];
      if (expItems.length) {
        const nowDate = new Date();
        const now = nowDate.getFullYear() * 12 + nowDate.getMonth();
        const rows = expItems.map((e) => ({
          e,
          start: toMonth(e.start, now),
          end: toMonth(e.end, now) + 1,
        }));
        const firstYear = Math.floor(Math.min(...rows.map((r) => r.start)) / 12);
        const lastYear = nowDate.getFullYear() + 1;
        const span = Math.max(12, (lastYear - firstYear) * 12);
        const pct = (m) => ((m - firstYear * 12) / span) * 100;
        const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

        const axis = el('div', { class: 'timeline-axis', 'aria-hidden': 'true' },
          years.map((y) => {
            const s = el('span', { text: String(y) });
            s.style.left = `${pct(y * 12)}%`;
            return s;
          }),
        );

        const list = el('ol', { class: 'timeline-rows' });
        for (const { e, start, end } of rows) {
          const ongoing = isOngoing(e.end);
          const bullets = Array.isArray(e.bullets) && e.bullets.length
            ? el('ul', null, e.bullets.map((b) => el('li', { text: b })))
            : null;

          const labelCol = el('div', { class: 'timeline-label' },
            el('h3', { text: e.role || '' }),
            el('p', { class: 'timeline-meta', text: e.company + (e.location ? `, ${e.location}` : '') }),
            el('p', { class: 'timeline-dates', text: `${e.start || ''} ${t.to} ${e.end || t.present}` }),
            bullets,
          );

          const bar = el('span', { class: `timeline-bar${ongoing ? ' is-ongoing' : ''}` });
          bar.style.left = `${Math.max(0, pct(start))}%`;
          bar.style.width = `${Math.max(pct(end) - pct(start), 1.4)}%`;

          const track = el('div', { class: 'timeline-track', 'aria-hidden': 'true' },
            years.map((y) => {
              const tick = el('i');
              tick.style.left = `${pct(y * 12)}%`;
              return tick;
            }),
            bar,
          );

          list.appendChild(el('li', { class: 'timeline-row' }, labelCol, track));
        }

        expEl.appendChild(el('div', { class: 'timeline' }, axis, list));
      }
    }

    // 6. Projects & Accessible Modal
    const projectsEl = document.getElementById('projects');
    const modal = document.getElementById('project-modal');
    const modalClose = document.getElementById('modal-close');
    const modalMedia = document.getElementById('modal-media');
    const modalTitle = document.getElementById('modal-title');
    const modalTags = document.getElementById('modal-tags');
    const modalDetails = document.getElementById('modal-details');
    const modalActions = document.getElementById('modal-actions');

    const projectItems = Array.isArray(content.projects) ? content.projects : [];
    let lastTriggerEl = null;

    function resolveProjectThumb(pr, idx) {
      return safeUrl(pr.thumbnail) || FALLBACK_THUMBS[idx % FALLBACK_THUMBS.length];
    }

    function openProjectModal(pr, idx, triggerEl) {
      if (!modal || !pr) return;
      lastTriggerEl = triggerEl || document.activeElement;

      if (modalClose) modalClose.setAttribute('aria-label', t.closeModal);

      if (modalMedia) {
        modalMedia.textContent = '';
        const img = el('img', {
          class: 'modal-thumb',
          src: resolveProjectThumb(pr, idx),
          alt: pr.title || '',
        });
        modalMedia.appendChild(img);
      }

      if (modalTitle) modalTitle.textContent = pr.title || '';

      if (modalTags) {
        modalTags.textContent = '';
        for (const tag of pr.tags || []) {
          modalTags.appendChild(el('span', { class: 'tag', text: tag }));
        }
      }

      if (modalDetails) {
        renderParagraphs(modalDetails, pr.details || pr.summary || '');
      }

      if (modalActions) {
        modalActions.textContent = '';
        const videoHref = safeUrl(pr.video);
        const linkHref = safeUrl(pr.link);
        if (videoHref) {
          modalActions.appendChild(el('a', {
            class: 'btn btn-primary',
            href: videoHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: t.watchVideo,
          }));
        }
        if (linkHref) {
          modalActions.appendChild(el('a', {
            class: videoHref ? 'btn btn-ghost' : 'btn btn-primary',
            href: linkHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: t.viewProject,
          }));
        }
      }

      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
      if (modalClose) modalClose.focus();
    }

    function closeProjectModal() {
      if (!modal) return;
      if (typeof modal.close === 'function' && modal.open) {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
      if (window.location.hash.startsWith('#project-')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
        lastTriggerEl.focus();
      }
    }

    function openProjectByHash(hash) {
      if (!hash || !hash.startsWith('#project-')) return false;
      const target = hash.slice('#project-'.length).toLowerCase();
      if (!target) return false;
      // Match exact slug first, then prefix/contains match (so #project-prexora matches prexora-pmp-exam-prep-platform)
      let idx = projectItems.findIndex((p) => (p.slug || '').toLowerCase() === target);
      if (idx === -1) {
        idx = projectItems.findIndex((p) => (p.slug || '').toLowerCase().startsWith(target));
      }
      if (idx === -1) {
        idx = projectItems.findIndex((p) => (p.slug || '').toLowerCase().includes(target));
      }
      if (idx !== -1) {
        openProjectModal(projectItems[idx], idx);
        return true;
      }
      return false;
    }

    window.__PORTFOLIO__.openProjectByHash = openProjectByHash;

    if (modal) {
      if (modalClose) modalClose.addEventListener('click', closeProjectModal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeProjectModal();
      });
      modal.addEventListener('cancel', () => {
        setTimeout(() => {
          if (window.location.hash.startsWith('#project-')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
            lastTriggerEl.focus();
          }
        }, 0);
      });
    }

    if (projectsEl) {
      projectsEl.textContent = '';
      projectsEl.appendChild(el('h2', { id: 'projects-heading', text: t.projects }));

      const grid = el('ul', { class: 'project-grid' });
      const remainder = projectItems.length % 3;

      projectItems.forEach((pr, idx) => {
        let cardClass = 'project-card';
        if (idx === 0 && projectItems.length > 1) {
          cardClass += ' is-lead';
          if (remainder === 1) cardClass += ' lead-full';
          else if (remainder === 0) cardClass += ' lead-tall';
        }

        const thumbImg = el('img', {
          src: resolveProjectThumb(pr, idx),
          alt: '',
          loading: 'lazy',
        });

        const hitBtn = el('button', {
          type: 'button',
          class: 'project-hit',
          onClick: (ev) => {
            if (pr.slug) {
              history.replaceState(null, '', `#project-${pr.slug}`);
            }
            openProjectModal(pr, idx, ev.currentTarget);
          },
        },
          el('span', { class: 'project-thumb' }, thumbImg),
          el('span', { class: 'project-body' },
            el('span', { class: 'project-title', text: pr.title || '' }),
            el('span', { class: 'project-summary', text: pr.summary || '' }),
            Array.isArray(pr.tags) && pr.tags.length
              ? el('span', { class: 'tags' }, pr.tags.map((tag) => el('span', { class: 'tag', text: tag })))
              : null,
          ),
        );

        const videoHref = safeUrl(pr.video);
        const videoBadge = videoHref
          ? el('a', {
              class: 'project-video',
              href: videoHref,
              target: '_blank',
              rel: 'noopener noreferrer',
              text: t.watchVideo,
            })
          : null;

        grid.appendChild(el('li', { class: cardClass, id: pr.slug ? `project-${pr.slug}` : undefined }, hitBtn, videoBadge));
      });

      projectsEl.appendChild(grid);
    }

    window.addEventListener('hashchange', () => openProjectByHash(window.location.hash));
    if (window.location.hash.startsWith('#project-')) {
      openProjectByHash(window.location.hash);
    }

    // 7. Skills, Certifications & Education
    const skillsEl = document.getElementById('skills');
    if (skillsEl) {
      skillsEl.textContent = '';
      skillsEl.appendChild(el('h2', { id: 'skills-heading', text: t.skills }));

      const skillsGrid = el('div', { class: 'skills-grid' });
      for (const group of content.skills || []) {
        skillsGrid.appendChild(el('div', { class: 'skill-group' },
          el('h3', { text: group.group || '' }),
          el('p', { text: (group.items || []).join(', ') }),
        ));
      }
      skillsEl.appendChild(skillsGrid);

      const certs = Array.isArray(content.certifications) ? content.certifications : [];
      const edu = Array.isArray(content.education) ? content.education : [];
      if (certs.length || edu.length) {
        const creds = el('div', { class: 'creds' });
        if (certs.length) {
          creds.appendChild(el('div', null,
            el('h3', { text: t.certifications }),
            el('ul', null, certs.map((c) => {
              const sub = [c.issuer, c.detail].filter(Boolean).join(' · ');
              return el('li', null,
                el('strong', { text: c.name || '' }),
                sub ? el('small', { text: sub }) : null,
              );
            })),
          ));
        }
        if (edu.length) {
          creds.appendChild(el('div', null,
            el('h3', { text: t.education }),
            el('ul', null, edu.map((ed) => {
              const sub = [ed.school, ed.period].filter(Boolean).join(' · ');
              return el('li', null,
                el('strong', { text: ed.degree || '' }),
                sub ? el('small', { text: sub }) : null,
              );
            })),
          ));
        }
        skillsEl.appendChild(creds);
      }
    }

    // 8. Contact (hide empty links)
    const contactEl = document.getElementById('contact');
    if (contactEl) {
      contactEl.textContent = '';
      const list = el('ul', { class: 'contact-list' });
      if (profile.email) {
        list.appendChild(el('li', null,
          el('span', { text: t.emailLabel }),
          el('a', { href: `mailto:${profile.email}`, text: profile.email }),
        ));
      }
      const linkedinHref = safeUrl(profile.linkedin);
      if (linkedinHref) {
        list.appendChild(el('li', null,
          el('span', { text: t.linkedinLabel }),
          el('a', {
            href: linkedinHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: linkedinHref.replace(/^https?:\/\/(www\.)?/i, ''),
          }),
        ));
      }
      const githubHref = safeUrl(profile.github);
      if (githubHref) {
        list.appendChild(el('li', null,
          el('span', { text: t.githubLabel }),
          el('a', {
            href: githubHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: githubHref.replace(/^https?:\/\/(www\.)?/i, ''),
          }),
        ));
      }
      const websiteHref = safeUrl(profile.website);
      if (websiteHref) {
        list.appendChild(el('li', null,
          el('span', { text: t.websiteLabel }),
          el('a', {
            href: websiteHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: websiteHref.replace(/^https?:\/\/(www\.)?/i, ''),
          }),
        ));
      }

      const rightCol = el('div', null,
        el('p', { class: 'contact-lead', text: t.contactLead }),
        list,
      );
      contactEl.append(el('h2', { id: 'contact-heading', text: t.contact }), rightCol);
    }

    // 9. Footer
    const footerEl = document.getElementById('site-footer');
    if (footerEl) {
      const year = new Date().getFullYear();
      footerEl.textContent = `© ${year} ${profile.name || 'Timothée Kabwe'}${profile.location ? ` · ${profile.location}` : ''}`;
    }

    // 10. Floating Ask button (hides while chat section is visible)
    const fab = document.getElementById('floating-ask');
    const chatSection = document.getElementById('assistant');
    if (fab) {
      fab.textContent = '';
      fab.appendChild(svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        svgEl('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
      ));
      fab.appendChild(el('span', { text: t.askAssistant }));
      fab.setAttribute('aria-label', t.askAssistant);
      fab.addEventListener('click', focusChatInput);

      if (chatSection && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            const visible = entries[0]?.isIntersecting;
            fab.classList.toggle('is-hidden', Boolean(visible));
          },
          { threshold: 0.12 },
        );
        observer.observe(chatSection);
      } else {
        fab.classList.remove('is-hidden');
      }
    }

    document.dispatchEvent(new CustomEvent('portfolio:ready', { detail: { lang, content } }));
  }

  async function boot() {
    const embedded = loadInitialPayload();
    if (embedded && embedded.content) {
      initPortfolio(embedded);
      return;
    }
    const lang = document.body.dataset.lang === 'fr' ? 'fr' : 'en';
    try {
      const res = await fetch(`/api/content?lang=${lang}`);
      if (res.ok) {
        const payload = await res.json();
        initPortfolio(payload);
      }
    } catch (err) {
      console.error('Failed to load portfolio content:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
