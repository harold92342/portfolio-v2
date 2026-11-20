(function () {
  'use strict';

  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_PDF_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ALLOWED_PDF_TYPES = ['application/pdf'];

  const state = {
    data: null,        // { en: {...}, fr: {...} }
    lang: 'en',
    tab: 'profile',
    dirty: false,
    dbAvailable: true,
    saving: false,
  };

  const loginView = document.getElementById('login-view');
  const editorView = document.getElementById('editor-view');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  const saveStatus = document.getElementById('save-status');
  const saveBtn = document.getElementById('save-btn');
  const exportBtn = document.getElementById('export-btn');
  const resetBtn = document.getElementById('reset-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const dbWarning = document.getElementById('db-warning');
  const toastBanner = document.getElementById('toast-banner');
  const tabPanel = document.getElementById('tab-panel');

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
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

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function setDirty(isDirty) {
    state.dirty = isDirty;
    if (saveStatus) {
      saveStatus.textContent = isDirty ? 'Unsaved changes' : 'All changes saved';
      saveStatus.classList.toggle('is-dirty', isDirty);
    }
  }

  let toastTimer = null;
  function showToast(message, type = 'success') {
    if (!toastBanner) return;
    toastBanner.textContent = message;
    toastBanner.className = `admin-banner is-${type}`;
    toastBanner.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBanner.hidden = true;
    }, 5000);
  }

  function currentContent() {
    return state.data[state.lang];
  }

  function makeField(label, value, onInput, { type = 'text', placeholder = '', multiline = false, rows = 4 } = {}) {
    const input = multiline
      ? el('textarea', { rows: String(rows), placeholder })
      : el('input', { type, placeholder });
    input.value = value || '';
    input.addEventListener('input', (ev) => {
      onInput(ev.target.value);
      setDirty(true);
    });
    return el('label', { class: 'field' }, el('span', { text: label }), input);
  }

  /**
   * Direct browser-to-Vercel-Blob upload using a short-lived server-issued client token.
   */
  async function uploadAsset(file, kind) {
    const isPdf = kind === 'resume';
    const allowedTypes = isPdf ? ALLOWED_PDF_TYPES : ALLOWED_IMAGE_TYPES;
    const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    const maxLabel = isPdf ? '5 MB PDF' : '4 MB JPG, PNG, or WebP';

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type (${file.type || 'unknown'}). Allowed: ${maxLabel}.`);
    }
    if (file.size <= 0 || file.size > maxBytes) {
      throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed: ${maxLabel}.`);
    }

    const tokenRes = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      throw new Error(tokenData.error || 'Could not authorize upload.');
    }

    const blobRes = await fetch(tokenData.uploadUrl, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tokenData.clientToken}`,
        'x-api-version': tokenData.apiVersion || '9',
        'x-content-type': file.type,
        'x-add-random-suffix': '1',
      },
      body: file,
    });

    if (!blobRes.ok) {
      const errText = await blobRes.text().catch(() => '');
      throw new Error(errText || 'Upload to Vercel Blob failed.');
    }

    const uploaded = await blobRes.json();
    if (!uploaded?.url) {
      throw new Error('Upload succeeded but returned no URL.');
    }
    return uploaded.url;
  }

  function makeAssetField({ label, kind, value, onChange, accept, previewType }) {
    const urlInput = el('input', {
      type: 'url',
      placeholder: 'https://… or /assets/…',
    });
    urlInput.value = value || '';

    const previewWrap = el('div', { class: 'preview-box' });

    function refreshPreview(url) {
      previewWrap.textContent = '';
      if (!url) return;
      if (previewType === 'avatar') {
        previewWrap.appendChild(el('img', { class: 'preview-avatar', src: url, alt: 'Profile preview' }));
      } else if (previewType === 'thumb') {
        previewWrap.appendChild(el('img', { class: 'preview-thumb', src: url, alt: 'Thumbnail preview' }));
      } else if (previewType === 'pdf') {
        previewWrap.appendChild(el('a', {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'Open current PDF ↗',
        }));
      }
    }

    urlInput.addEventListener('input', (ev) => {
      onChange(ev.target.value.trim());
      refreshPreview(ev.target.value.trim());
      setDirty(true);
    });

    const fileInput = el('input', { type: 'file', class: 'upload-input', accept });
    const uploadLabel = el('label', { class: 'upload-btn' },
      el('span', { text: 'Upload file' }),
      fileInput,
    );

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;

      const span = uploadLabel.querySelector('span');
      if (span) span.textContent = 'Uploading…';

      try {
        const publicUrl = await uploadAsset(file, kind);
        urlInput.value = publicUrl;
        onChange(publicUrl);
        refreshPreview(publicUrl);
        setDirty(true);
        showToast('File uploaded. Click "Save changes" to publish it live.', 'success');
      } catch (err) {
        showToast(err?.message || 'Upload failed.', 'error');
      } finally {
        if (span) span.textContent = 'Upload file';
      }
    });

    refreshPreview(value);

    return el('div', { class: 'field' },
      el('span', { text: label }),
      el('div', { class: 'upload-row' }, urlInput, uploadLabel),
      previewWrap,
    );
  }

  function makeListControls(list, index, onMutate) {
    const upBtn = el('button', {
      type: 'button',
      class: 'ctrl-btn',
      text: '↑',
      title: 'Move up',
      disabled: index === 0,
      onClick: () => {
        if (index === 0) return;
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        setDirty(true);
        onMutate();
      },
    });
    const downBtn = el('button', {
      type: 'button',
      class: 'ctrl-btn',
      text: '↓',
      title: 'Move down',
      disabled: index === list.length - 1,
      onClick: () => {
        if (index >= list.length - 1) return;
        [list[index + 1], list[index]] = [list[index], list[index + 1]];
        setDirty(true);
        onMutate();
      },
    });
    const delBtn = el('button', {
      type: 'button',
      class: 'ctrl-btn ctrl-btn-danger',
      text: 'Delete',
      onClick: () => {
        if (!window.confirm('Delete this item?')) return;
        list.splice(index, 1);
        setDirty(true);
        onMutate();
      },
    });
    return el('div', { class: 'item-controls' }, upBtn, downBtn, delBtn);
  }

  function renderProfileTab(c) {
    const p = c.profile;
    c.highlights = Array.isArray(c.highlights) ? c.highlights : [];

    const basicCard = el('section', { class: 'admin-card admin-stack' },
      el('h2', { text: `Profile (${state.lang.toUpperCase()})` }),
      el('div', { class: 'admin-grid-2' },
        makeField('Name', p.name, (v) => { p.name = v; }),
        makeField('Title', p.title, (v) => { p.title = v; }),
        makeField('Location', p.location, (v) => { p.location = v; }),
        makeField('Email', p.email, (v) => { p.email = v; }, { type: 'email' }),
        makeField('LinkedIn URL', p.linkedin, (v) => { p.linkedin = v; }, { type: 'url' }),
        makeField('GitHub URL (optional)', p.github, (v) => { p.github = v; }, { type: 'url' }),
        makeField('Website URL (optional)', p.website, (v) => { p.website = v; }, { type: 'url' }),
      ),
      makeField('Tagline (also used for SEO & LinkedIn preview)', p.tagline, (v) => { p.tagline = v; }, { multiline: true, rows: 2 }),
      makeField('Availability note', p.availability, (v) => { p.availability = v; }, { multiline: true, rows: 2 }),
      makeField('Bio (separate paragraphs with a blank line)', c.bio, (v) => { c.bio = v; }, { multiline: true, rows: 7 }),
    );

    const mediaCard = el('section', { class: 'admin-card admin-stack' },
      el('h2', { text: 'Photo & Resume' }),
      makeAssetField({
        label: 'Profile photo (JPG, PNG, WebP up to 4 MB — cropped to a circle on the site)',
        kind: 'photo',
        value: p.photo,
        onChange: (v) => { p.photo = v; },
        accept: 'image/jpeg,image/png,image/webp',
        previewType: 'avatar',
      }),
      makeAssetField({
        label: `Resume PDF (${state.lang.toUpperCase()}, PDF up to 5 MB)`,
        kind: 'resume',
        value: p.resume,
        onChange: (v) => { p.resume = v; },
        accept: 'application/pdf',
        previewType: 'pdf',
      }),
    );

    const highlightsList = el('div', { class: 'item-list' });
    c.highlights.forEach((h, idx) => {
      highlightsList.appendChild(el('div', { class: 'item-card' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: `Highlight ${idx + 1}` }),
          makeListControls(c.highlights, idx, renderActiveTab),
        ),
        el('div', { class: 'admin-grid-2' },
          makeField('Value (e.g. 5+, PMP®)', h.value, (v) => { h.value = v; }),
          makeField('Label', h.label, (v) => { h.label = v; }),
        ),
      ));
    });

    const highlightsSection = el('section', { class: 'admin-stack' },
      el('div', { class: 'admin-section-head' },
        el('h2', { text: 'Highlights' }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '+ Add highlight',
          onClick: () => {
            c.highlights.push({ value: '', label: '' });
            setDirty(true);
            renderActiveTab();
          },
        }),
      ),
      highlightsList,
    );

    return el('div', { class: 'admin-stack' }, basicCard, mediaCard, highlightsSection);
  }

  function renderExperienceTab(c) {
    c.experience = Array.isArray(c.experience) ? c.experience : [];
    const list = el('div', { class: 'item-list' });

    c.experience.forEach((exp, idx) => {
      list.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: exp.role || `Role ${idx + 1}` }),
          makeListControls(c.experience, idx, renderActiveTab),
        ),
        el('div', { class: 'admin-grid-2' },
          makeField('Role / Title', exp.role, (v) => { exp.role = v; }),
          makeField('Company', exp.company, (v) => { exp.company = v; }),
          makeField('Start (e.g. Dec 2021 / déc. 2021)', exp.start, (v) => { exp.start = v; }),
          makeField('End (e.g. Present / Aujourd\'hui)', exp.end, (v) => { exp.end = v; }),
          makeField('Location', exp.location, (v) => { exp.location = v; }),
        ),
        makeField(
          'Achievements (one bullet per line)',
          (exp.bullets || []).join('\n'),
          (v) => { exp.bullets = v.split('\n').map((l) => l.trim()).filter(Boolean); },
          { multiline: true, rows: 4 },
        ),
      ));
    });

    return el('section', { class: 'admin-stack' },
      el('div', { class: 'admin-section-head' },
        el('h2', { text: `Experience (${state.lang.toUpperCase()})` }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '+ Add role',
          onClick: () => {
            c.experience.unshift({ role: '', company: '', start: '', end: state.lang === 'fr' ? "Aujourd'hui" : 'Present', location: '', bullets: [] });
            setDirty(true);
            renderActiveTab();
          },
        }),
      ),
      list,
    );
  }

  function renderProjectsTab(c) {
    c.projects = Array.isArray(c.projects) ? c.projects : [];
    const list = el('div', { class: 'item-list' });

    c.projects.forEach((pr, idx) => {
      list.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: pr.title || `Project ${idx + 1}` }),
          makeListControls(c.projects, idx, renderActiveTab),
        ),
        el('div', { class: 'admin-grid-2' },
          makeField('Title', pr.title, (v) => {
            pr.title = v;
            if (!pr.slug || pr.slug === slugify(pr.title)) pr.slug = slugify(v);
          }),
          makeField('Slug (used for /#project-<slug> links)', pr.slug, (v) => { pr.slug = slugify(v); }),
          makeField('External link (optional)', pr.link, (v) => { pr.link = v; }, { type: 'url' }),
          makeField('Video URL (optional)', pr.video, (v) => { pr.video = v; }, { type: 'url' }),
        ),
        makeField('One-line summary', pr.summary, (v) => { pr.summary = v; }, { multiline: true, rows: 2 }),
        makeField(
          'Tags (comma-separated)',
          (pr.tags || []).join(', '),
          (v) => { pr.tags = v.split(',').map((t) => t.trim()).filter(Boolean); },
        ),
        makeAssetField({
          label: 'Thumbnail (16:9 preview — JPG, PNG, WebP up to 4 MB)',
          kind: 'thumbnail',
          value: pr.thumbnail,
          onChange: (v) => { pr.thumbnail = v; },
          accept: 'image/jpeg,image/png,image/webp',
          previewType: 'thumb',
        }),
        makeField('Full description (shown in pop-up modal)', pr.details, (v) => { pr.details = v; }, { multiline: true, rows: 5 }),
      ));
    });

    return el('section', { class: 'admin-stack' },
      el('div', { class: 'admin-section-head' },
        el('h2', { text: `Projects (${state.lang.toUpperCase()})` }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '+ Add project',
          onClick: () => {
            c.projects.push({ slug: '', title: '', summary: '', details: '', thumbnail: '', video: '', link: '', tags: [] });
            setDirty(true);
            renderActiveTab();
          },
        }),
      ),
      list,
    );
  }

  function renderSkillsTab(c) {
    c.skills = Array.isArray(c.skills) ? c.skills : [];
    const list = el('div', { class: 'item-list' });

    c.skills.forEach((sk, idx) => {
      list.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: sk.group || `Skill group ${idx + 1}` }),
          makeListControls(c.skills, idx, renderActiveTab),
        ),
        makeField('Group name', sk.group, (v) => { sk.group = v; }),
        makeField(
          'Skills (comma-separated)',
          (sk.items || []).join(', '),
          (v) => { sk.items = v.split(',').map((s) => s.trim()).filter(Boolean); },
          { multiline: true, rows: 2 },
        ),
      ));
    });

    return el('section', { class: 'admin-stack' },
      el('div', { class: 'admin-section-head' },
        el('h2', { text: `Skills (${state.lang.toUpperCase()})` }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '+ Add skill group',
          onClick: () => {
            c.skills.push({ group: '', items: [] });
            setDirty(true);
            renderActiveTab();
          },
        }),
      ),
      list,
    );
  }

  function renderCredentialsTab(c) {
    c.certifications = Array.isArray(c.certifications) ? c.certifications : [];
    c.education = Array.isArray(c.education) ? c.education : [];

    const certList = el('div', { class: 'item-list' });
    c.certifications.forEach((cert, idx) => {
      certList.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: cert.name || `Certification ${idx + 1}` }),
          makeListControls(c.certifications, idx, renderActiveTab),
        ),
        el('div', { class: 'admin-grid-2' },
          makeField('Certification name', cert.name, (v) => { cert.name = v; }),
          makeField('Issuer', cert.issuer, (v) => { cert.issuer = v; }),
          makeField('Detail / ID / Year (optional)', cert.detail, (v) => { cert.detail = v; }),
        ),
      ));
    });

    const eduList = el('div', { class: 'item-list' });
    c.education.forEach((ed, idx) => {
      eduList.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: ed.degree || `Education ${idx + 1}` }),
          makeListControls(c.education, idx, renderActiveTab),
        ),
        el('div', { class: 'admin-grid-2' },
          makeField('Degree', ed.degree, (v) => { ed.degree = v; }),
          makeField('School / University', ed.school, (v) => { ed.school = v; }),
          makeField('Period', ed.period, (v) => { ed.period = v; }),
        ),
      ));
    });

    return el('div', { class: 'admin-stack' },
      el('section', { class: 'admin-stack' },
        el('div', { class: 'admin-section-head' },
          el('h2', { text: `Certifications (${state.lang.toUpperCase()})` }),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            text: '+ Add certification',
            onClick: () => {
              c.certifications.push({ name: '', issuer: '', detail: '' });
              setDirty(true);
              renderActiveTab();
            },
          }),
        ),
        certList,
      ),
      el('section', { class: 'admin-stack' },
        el('div', { class: 'admin-section-head' },
          el('h2', { text: `Education (${state.lang.toUpperCase()})` }),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            text: '+ Add education',
            onClick: () => {
              c.education.push({ degree: '', school: '', period: '' });
              setDirty(true);
              renderActiveTab();
            },
          }),
        ),
        eduList,
      ),
    );
  }

  function renderFaqTab(c) {
    c.faq = Array.isArray(c.faq) ? c.faq : [];
    c.suggestedQuestions = Array.isArray(c.suggestedQuestions) ? c.suggestedQuestions : [];

    const faqList = el('div', { class: 'item-list' });
    c.faq.forEach((item, idx) => {
      faqList.appendChild(el('div', { class: 'item-card admin-stack' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: item.q || `FAQ ${idx + 1}` }),
          makeListControls(c.faq, idx, renderActiveTab),
        ),
        makeField('Question', item.q, (v) => { item.q = v; }),
        makeField('Answer', item.a, (v) => { item.a = v; }, { multiline: true, rows: 3 }),
      ));
    });

    const sqList = el('div', { class: 'item-list' });
    c.suggestedQuestions.forEach((q, idx) => {
      sqList.appendChild(el('div', { class: 'item-card' },
        el('div', { class: 'item-card-head' },
          el('span', { class: 'item-card-title', text: `Suggested question ${idx + 1}` }),
          makeListControls(c.suggestedQuestions, idx, renderActiveTab),
        ),
        makeField('Chip text', q, (v) => { c.suggestedQuestions[idx] = v; }),
      ));
    });

    return el('div', { class: 'admin-stack' },
      el('section', { class: 'admin-stack' },
        el('div', { class: 'admin-section-head' },
          el('h2', { text: `FAQ (${state.lang.toUpperCase()})` }),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            text: '+ Add FAQ',
            onClick: () => {
              c.faq.push({ q: '', a: '' });
              setDirty(true);
              renderActiveTab();
            },
          }),
        ),
        faqList,
      ),
      el('section', { class: 'admin-stack' },
        el('div', { class: 'admin-section-head' },
          el('h2', { text: `Suggested questions (${state.lang.toUpperCase()})` }),
          el('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            text: '+ Add question chip',
            onClick: () => {
              c.suggestedQuestions.push('');
              setDirty(true);
              renderActiveTab();
            },
          }),
        ),
        sqList,
      ),
    );
  }

  function renderActiveTab() {
    if (!tabPanel || !state.data) return;
    const c = currentContent();
    tabPanel.textContent = '';

    if (state.tab === 'profile') tabPanel.appendChild(renderProfileTab(c));
    else if (state.tab === 'experience') tabPanel.appendChild(renderExperienceTab(c));
    else if (state.tab === 'projects') tabPanel.appendChild(renderProjectsTab(c));
    else if (state.tab === 'skills') tabPanel.appendChild(renderSkillsTab(c));
    else if (state.tab === 'credentials') tabPanel.appendChild(renderCredentialsTab(c));
    else if (state.tab === 'faq') tabPanel.appendChild(renderFaqTab(c));
  }

  function showLogin() {
    if (editorView) editorView.hidden = true;
    if (loginView) loginView.hidden = false;
    if (loginPassword) {
      loginPassword.value = '';
      loginPassword.focus();
    }
  }

  function showEditor() {
    if (loginView) loginView.hidden = true;
    if (editorView) editorView.hidden = false;
    if (dbWarning) dbWarning.hidden = state.dbAvailable;
    if (saveBtn) saveBtn.disabled = !state.dbAvailable;
    if (resetBtn) resetBtn.disabled = !state.dbAvailable;
    renderActiveTab();
  }

  async function loadAdminData() {
    const res = await fetch('/api/admin/content', { cache: 'no-store' });
    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok) {
      showToast('Could not load content from server.', 'error');
      return;
    }
    const payload = await res.json();
    state.data = payload.data;
    state.dbAvailable = Boolean(payload.dbAvailable);
    setDirty(false);
    showEditor();
  }

  // Event wiring: Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (loginError) loginError.hidden = true;
      if (loginSubmit) loginSubmit.disabled = true;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: loginPassword?.value || '' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (loginError) {
            loginError.textContent = data.error || 'Sign-in failed.';
            loginError.hidden = false;
          }
          return;
        }
        await loadAdminData();
      } catch {
        if (loginError) {
          loginError.textContent = 'Network error. Please try again.';
          loginError.hidden = false;
        }
      } finally {
        if (loginSubmit) loginSubmit.disabled = false;
      }
    });
  }

  // Language switcher
  document.querySelectorAll('.lang-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextLang = btn.dataset.lang === 'fr' ? 'fr' : 'en';
      if (nextLang === state.lang) return;
      state.lang = nextLang;
      document.querySelectorAll('.lang-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === nextLang));
      renderActiveTab();
    });
  });

  // Tab switcher
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.tab;
      if (!nextTab || nextTab === state.tab) return;
      state.tab = nextTab;
      document.querySelectorAll('.admin-tab').forEach((b) => {
        const active = b.dataset.tab === nextTab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderActiveTab();
    });
  });

  // Save both languages
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (state.saving || !state.data) return;
      state.saving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      try {
        const res = await fetch('/api/admin/content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: state.data }),
        });
        const result = await res.json().catch(() => ({}));
        if (res.status === 401) {
          showLogin();
          return;
        }
        if (!res.ok) {
          showToast(result.error || 'Could not save changes.', 'error');
          return;
        }

        setDirty(false);
        showToast('Changes saved! Both English and French pages are live.', 'success');

        // Prime fresh non-cached copies so the owner sees edits immediately
        fetch('/?refresh=1', { cache: 'no-store' }).catch(() => {});
        fetch('/fr?refresh=1', { cache: 'no-store' }).catch(() => {});
      } catch {
        showToast('Network error while saving.', 'error');
      } finally {
        state.saving = false;
        saveBtn.disabled = !state.dbAvailable;
        saveBtn.textContent = 'Save changes';
      }
    });
  }

  // Reset from profile.md & profile.fr.md
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!window.confirm('Reset BOTH English and French content from content/profile.md and content/profile.fr.md? Unsaved and live database edits will be overwritten.')) {
        return;
      }
      resetBtn.disabled = true;
      try {
        const res = await fetch('/api/admin/content', { method: 'POST' });
        const result = await res.json().catch(() => ({}));
        if (res.status === 401) {
          showLogin();
          return;
        }
        if (!res.ok) {
          showToast(result.error || 'Reset failed.', 'error');
          return;
        }
        state.data = result.data;
        setDirty(false);
        renderActiveTab();
        showToast('Content reset from profile.md and profile.fr.md.', 'success');
      } catch {
        showToast('Network error while resetting.', 'error');
      } finally {
        resetBtn.disabled = !state.dbAvailable;
      }
    });
  }

  // Export JSON backup
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!state.data) return;
      const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // Sign out
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (state.dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) {
        return;
      }
      await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
      state.data = null;
      setDirty(false);
      showLogin();
    });
  }

  // Unsaved-changes guard
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // Boot
  loadAdminData();
})();
